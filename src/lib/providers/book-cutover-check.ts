import "server-only";
import { and, asc, eq, gt, inArray, sql } from "drizzle-orm";
import { creators, creatorRoles, creatorRequests, entryCreatorPseudonyms, entryCreators, entryCreatorSources, mediaItemMetadata, mediaItems, providerCreatorBindings, providerCreatorExclusions, providerSnapshotLinks, providerSnapshots } from "@/db/schema";
import { normalizeSearchText } from "@/lib/search/normalize";
import { describeBookSource } from "./book-adapters";
import { db } from "@/db";
import type { DbTransaction } from "@/db/transaction";
import type { BookProviderCode } from "./types";

type Issue = { mediaItemId: number; code: string; field?: string };
export type BookCutoverReport = { provider: BookProviderCode; books: number; manualLinks: number; pseudonyms: number; issueCount: number; issues: Issue[]; ready: boolean };
const BATCH_SIZE = 250;
const MAX_REPORTED_ISSUES = 100;

function meaningful(value: unknown): boolean {
  if (value === null || value === undefined) return false;
  if (typeof value === "string") return Boolean(value.trim());
  if (Array.isArray(value)) return value.some(meaningful);
  if (typeof value === "object") return Object.values(value).some(meaningful);
  return true;
}

function names(value: unknown): string[] | null {
  if (!meaningful(value)) return [];
  if (typeof value === "string") return [value.trim()];
  if (Array.isArray(value) && value.every((part) => typeof part === "string")) return value.map((part) => part.trim()).filter(Boolean);
  return null;
}

/** Read-only verification: never reads raw JSON or changes moderation decisions. */
export async function auditNormalizedBookCutover(providers: readonly BookProviderCode[], connection: typeof db | DbTransaction = db): Promise<BookCutoverReport[]> {
  const reports: BookCutoverReport[] = [];
  for (const provider of providers) {
    const report: BookCutoverReport = { provider, books: 0, manualLinks: 0, pseudonyms: 0, issueCount: 0, issues: [], ready: true };
    const issue = (mediaItemId: number, code: string, field?: string) => { report.issueCount++; if (report.issues.length < MAX_REPORTED_ISSUES) report.issues.push({ mediaItemId, code, ...(field ? { field } : {}) }); };
    let cursor = 0;
    while (true) {
      const rows = await connection.select({ id: mediaItems.id, facts: mediaItemMetadata.facts, language: mediaItemMetadata.originalLanguage, externalId: mediaItemMetadata.sourceExternalId,
        primaryLinked: sql<boolean>`exists(select 1 from ${providerSnapshotLinks} l join ${providerSnapshots} s on s.id=l.snapshot_id
          where l.entity_type='media-item' and l.entity_id=${mediaItems.id}::text and l.purpose='primary'
          and s.provider_code=${provider} and s.external_id=${mediaItemMetadata.sourceExternalId}
          and s.resource_type=${provider === "google-books" ? "volume" : "work"}
          and s.api_method=${provider === "fantlab" ? "search-ids" : provider === "google-books" ? "volumes.get" : "works.get"}
          and s.request_params=${provider === "fantlab" ? sql`jsonb_build_object('w', ${mediaItemMetadata.sourceExternalId})` : sql`'{}'::jsonb`})`,
      }).from(mediaItems).innerJoin(mediaItemMetadata, eq(mediaItemMetadata.mediaItemId, mediaItems.id))
        .where(and(eq(mediaItems.mediaType, "book"), eq(mediaItemMetadata.sourceProvider, provider), gt(mediaItems.id, cursor))).orderBy(asc(mediaItems.id)).limit(BATCH_SIZE);
      if (!rows.length) break;
      const ids = rows.map((row) => row.id);
      const [participants, pseudonyms] = await Promise.all([
        connection.select({ entryId: entryCreators.entryId, name: creators.name, role: creatorRoles.code, manual: entryCreators.isManual,
          sourceName: entryCreatorSources.normalizedExternalCreatorName, position: entryCreatorSources.sourcePosition, externalId: providerCreatorBindings.externalCreatorId,
        }).from(entryCreators).innerJoin(creators, eq(creators.id, entryCreators.creatorId)).innerJoin(creatorRoles, eq(creatorRoles.id, entryCreators.roleId))
          .leftJoin(entryCreatorSources, and(eq(entryCreatorSources.entryId, entryCreators.entryId), eq(entryCreatorSources.creatorId, entryCreators.creatorId), eq(entryCreatorSources.roleId, entryCreators.roleId), eq(entryCreatorSources.provider, provider)))
          .leftJoin(providerCreatorBindings, eq(providerCreatorBindings.id, entryCreatorSources.bindingId))
          .where(and(inArray(entryCreators.entryId, ids), inArray(creatorRoles.code, ["writer", "publisher"]))),
        connection.select({ entryId: entryCreatorPseudonyms.entryId }).from(entryCreatorPseudonyms).where(inArray(entryCreatorPseudonyms.entryId, ids)),
      ]);
      const normalizedNames = [...new Set(rows.flatMap((row) => [...(names(row.facts.authors) ?? []), ...(names(row.facts.publishers) ?? [])]).map(normalizeSearchText))];
      const [excluded, reopened] = normalizedNames.length ? await Promise.all([
        connection.select({ name: providerCreatorExclusions.normalizedExternalCreatorName, externalId: providerCreatorExclusions.externalCreatorId }).from(providerCreatorExclusions).where(and(eq(providerCreatorExclusions.provider, provider), eq(providerCreatorExclusions.mediaType, "book"), inArray(providerCreatorExclusions.normalizedExternalCreatorName, normalizedNames))),
        connection.select({ name: creatorRequests.normalizedExternalCreatorName, externalId: creatorRequests.externalCreatorId }).from(creatorRequests).where(and(eq(creatorRequests.provider, provider), eq(creatorRequests.mediaType, "book"), eq(creatorRequests.manuallyReopened, true), inArray(creatorRequests.normalizedExternalCreatorName, normalizedNames))),
      ]) : [[], []];
      const decisions = [...excluded, ...reopened];
      const preservedDecisions = new Set(decisions.filter(row=>row.externalId===null).map((row) => row.name));
      for (const row of rows) {
        report.books++;
        const current = participants.filter((part) => part.entryId === row.id);
        report.manualLinks += new Set(current.filter((part) => part.manual).map((part) => `${part.role}:${part.name}`)).size;
        report.pseudonyms += pseudonyms.filter((part) => part.entryId === row.id).length;
        try { if (!row.externalId) throw new Error(); describeBookSource(provider, row.externalId); } catch { issue(row.id, "INVALID_SOURCE_ID"); }
        if (!row.primaryLinked) issue(row.id, "PRIMARY_SNAPSHOT_MISSING");
        for (const [key, value] of Object.entries(row.facts)) if (!["authors", "fantlabAuthors", "publishers", "originalLanguage"].includes(key) && meaningful(value)) issue(row.id, "UNMIGRATED_LEGACY_FIELD", key);
        if (meaningful(row.facts.originalLanguage) && (typeof row.facts.originalLanguage !== "string" || row.language !== row.facts.originalLanguage.trim())) issue(row.id, "ORIGINAL_LANGUAGE_NOT_TRANSFERRED");
        for (const part of current) if (part.sourceName && part.position === null) issue(row.id, "CONTRIBUTOR_POSITION_MISSING", part.role);
        for (const [field, role] of [["authors", "writer"], ["publishers", "publisher"]] as const) {
          const historical = names(row.facts[field]);
          if (!historical) { issue(row.id, "INVALID_LEGACY_FIELD", field); continue; }
          for (const name of historical) {
            const normalized = normalizeSearchText(name);
            if (preservedDecisions.has(normalized)) continue;
            const identityReferences = field === "authors" && provider === "fantlab" && Array.isArray(row.facts.fantlabAuthors)
              ? row.facts.fantlabAuthors.filter((ref):ref is {id:string;name:string}=>Boolean(ref && typeof ref === "object" && typeof ref.name === "string" && normalizeSearchText(ref.name)===normalized && /^[1-9]\d*$/.test(String(ref.id)))) : [];
            if (identityReferences.length && identityReferences.every(ref=>decisions.some(decision=>decision.externalId===String(ref.id)) || current.some(part=>part.role==="writer" && part.externalId===String(ref.id)))) continue;
            if (!current.some((part) => part.role === role && (part.manual || part.sourceName) && (part.sourceName === normalized || normalizeSearchText(part.name) === normalized))) issue(row.id, "UNMATCHED_LEGACY_CONTRIBUTOR", field);
          }
        }
        if (meaningful(row.facts.fantlabAuthors)) {
          const references = row.facts.fantlabAuthors;
          if (!Array.isArray(references)) issue(row.id, "INVALID_LEGACY_FIELD", "fantlabAuthors");
          else for (const reference of references) {
            if (!reference || typeof reference !== "object" || typeof reference.name !== "string" || !/^[1-9]\d*$/.test(String(reference.id))) { issue(row.id, "INVALID_LEGACY_FIELD", "fantlabAuthors"); continue; }
            const decided = decisions.some((decision) => decision.externalId === String(reference.id) || (decision.externalId === null && decision.name === normalizeSearchText(reference.name)));
            if (!decided && !current.some((part) => part.role === "writer" && part.externalId === String(reference.id))) issue(row.id, "UNMATCHED_LEGACY_AUTHOR_ID", "fantlabAuthors");
          }
        }
      }
      cursor = rows.at(-1)!.id;
    }
    report.ready = report.issueCount === 0;
    reports.push(report);
  }
  return reports;
}

