import { syncTmdbCreatorRoster } from "./tmdb-creator-roster";
import { normalizeSearchSql } from "@/db/search";
import { and, eq, sql } from "drizzle-orm";
import { db } from "@/db";
import { creatorRequests, creatorRequestMediaItems, creatorRoles, creatorTypes, creators,
  providerCreatorBindings, providerCreatorExclusions, mediaItems, mediaItemMetadata, providerSnapshotLinks, providerSnapshots } from "@/db/schema";
import { normalizeSearchText } from "@/lib/search/normalize";
import { extractTmdbDirectorReferences, type TmdbDirectorReference } from "@/lib/creators/tmdb-directors";
import { describeTmdbFilmSource } from "@/lib/providers/tmdb-film-adapter";
import { snapshotHash } from "@/lib/providers/snapshot-values";
import { lockProviderSnapshotReferences } from "./provider-snapshots";
import type { CreatorTransaction } from "./creators";
import { createJobRun } from "./jobs";

export const TMDB_DIRECTOR_APPROVAL_JOB = "media.tmdb-director-approve";
/** Caller holds the media item lock. Lock all old/new request identities in stable order. */
export async function syncTmdbDirectorCreators(tx: CreatorTransaction, mediaItemId: number, references: (Omit<TmdbDirectorReference, "roleCode"> & {roleCode: "director" | "creator" | "showrunner"})[], options: { localizedNames?: boolean; mediaType?: "film" | "series"; roleCode?: "director" | "creator" | "showrunner" } = {}) {
  return syncTmdbCreatorRoster(tx, mediaItemId, references, { mediaType: options.mediaType ?? "film", roleCodes: [options.roleCode ?? "director"], localizedNames: options.localizedNames });
}

/** Current linked movie evidence only; caller holds the media item lock. No network. */
export async function getTmdbFilmDirectorSnapshot(tx: CreatorTransaction | typeof db, mediaItemId: number) {
  const [metadata] = await tx.select({ sourceProvider: mediaItemMetadata.sourceProvider, externalId: mediaItemMetadata.sourceExternalId, mediaType: mediaItems.mediaType }).from(mediaItems)
    .innerJoin(mediaItemMetadata, eq(mediaItemMetadata.mediaItemId, mediaItems.id)).where(eq(mediaItems.id, mediaItemId));
  if (metadata?.mediaType !== "film" || metadata.sourceProvider !== "tmdb" || !metadata.externalId) throw new Error("PROVIDER_SOURCE_CHANGED");
  const descriptor = describeTmdbFilmSource(metadata.externalId);
  const rows = await tx.select({ snapshot: providerSnapshots }).from(providerSnapshotLinks).innerJoin(providerSnapshots, eq(providerSnapshots.id, providerSnapshotLinks.snapshotId))
    .where(and(eq(providerSnapshotLinks.entityType, "media-item"), eq(providerSnapshotLinks.entityId, String(mediaItemId)), eq(providerSnapshotLinks.purpose, "primary"),
      eq(providerSnapshots.providerCode, "tmdb"), eq(providerSnapshots.externalId, metadata.externalId), eq(providerSnapshots.resourceType, "movie"),
      eq(providerSnapshots.apiMethod, descriptor.apiMethod), eq(providerSnapshots.requestParams, descriptor.requestParams), eq(providerSnapshots.requestKey, snapshotHash(descriptor.requestParams))));
  if (rows.length !== 1) throw new Error("PROVIDER_SNAPSHOT_MISSING");
  return { snapshot: rows[0].snapshot, references: extractTmdbDirectorReferences(rows[0].snapshot) };
}

export async function syncTmdbFilmDirectors(tx: CreatorTransaction, mediaItemId: number, options: { enqueueApproval?: boolean } = {}) {
  const { snapshot, references } = await getTmdbFilmDirectorSnapshot(tx, mediaItemId);
  await lockProviderSnapshotReferences(tx, [{ id: snapshot.id, payloadHash: snapshot.payloadHash }]);
  const result = await syncTmdbDirectorCreators(tx, mediaItemId, references, { localizedNames: true });
  const externalIds = references.map(ref => ref.externalId);
  if (options.enqueueApproval !== false) for (let offset = 0; offset < externalIds.length; offset += 1000) {
    await createJobRun({ type: TMDB_DIRECTOR_APPROVAL_JOB, payload: { externalIds: externalIds.slice(offset, offset + 1000) }, source: "event",
      maxAttempts: 3, timeoutSeconds: 300, retryBaseSeconds: 60, retryMaxSeconds: 3600 }, new Date(), tx);
  }
  return result;
}

export type TmdbDirectorPreview = { id: number; directors: number; removed: number; linked: number; pending: number; excluded: number; conflicts: number };
/** Read-only planning: no decisions, bindings, jobs or profile requests are created. */
export async function previewTmdbFilmDirectors(tx: CreatorTransaction, mediaItemId: number): Promise<TmdbDirectorPreview> {
  const { snapshot, references } = await getTmdbFilmDirectorSnapshot(tx, mediaItemId);
  await lockProviderSnapshotReferences(tx, [{ id: snapshot.id, payloadHash: snapshot.payloadHash }]);
  const [role] = await tx.select({ id: creatorRoles.id }).from(creatorRoles).where(eq(creatorRoles.code, "director"));
  if (!role) throw new Error("Роль director не настроена.");
  const old = await tx.select({ externalId: creatorRequests.externalCreatorId }).from(creatorRequestMediaItems)
    .innerJoin(creatorRequests, eq(creatorRequests.id, creatorRequestMediaItems.requestId))
    .where(and(eq(creatorRequestMediaItems.mediaItemId, mediaItemId), eq(creatorRequestMediaItems.roleId, role.id), eq(creatorRequests.provider, "tmdb")));
  const result: TmdbDirectorPreview = { id: mediaItemId, directors: references.length, removed: old.filter(row => !references.some(ref => ref.externalId === row.externalId)).length, linked: 0, pending: 0, excluded: 0, conflicts: 0 };
  const { tmdbPersonNameCandidateQuery, tmdbPersonAliasCandidateQuery } = await import("./tmdb-person-identity");
  for (const ref of references) {
    const [request] = await tx.select().from(creatorRequests).where(and(eq(creatorRequests.provider, "tmdb"), eq(creatorRequests.externalCreatorId, ref.externalId)));
    const [excluded] = await tx.select({ id: providerCreatorExclusions.id }).from(providerCreatorExclusions).where(and(eq(providerCreatorExclusions.provider, "tmdb"),
      sql`(${providerCreatorExclusions.externalCreatorId}=${ref.externalId} or (${providerCreatorExclusions.externalCreatorId} is null and ${providerCreatorExclusions.mediaType}='film' and ${providerCreatorExclusions.normalizedExternalCreatorName}=${normalizeSearchText(ref.name)}))`));
    if (excluded || request?.decision === "exclude") { result.excluded++; continue; }
    if (request?.manuallyReopened && request.decision === null) { result.pending++; continue; }
    const bindings = await tx.select({ active: providerCreatorBindings.active, type: creatorTypes.code }).from(providerCreatorBindings)
      .innerJoin(creators, eq(creators.id, providerCreatorBindings.creatorId)).innerJoin(creatorTypes, eq(creatorTypes.id, creators.typeId))
      .where(and(eq(providerCreatorBindings.provider, "tmdb"), eq(providerCreatorBindings.externalCreatorId, ref.externalId)));
    const active = bindings.find(row => row.active);
    if (active?.type === "person") { result.linked++; continue; }
    const [candidate] = await tmdbPersonNameCandidateQuery(normalizeSearchText(ref.name), tx);
    const [alias] = await tmdbPersonAliasCandidateQuery(normalizeSearchText(ref.name), tx);
    const observations = request ? await tx.selectDistinct({ name: normalizeSearchSql(creatorRequestMediaItems.externalCreatorName) }).from(creatorRequestMediaItems)
      .where(and(eq(creatorRequestMediaItems.requestId, request.id), sql`${creatorRequestMediaItems.mediaItemId} <> ${mediaItemId}`)).limit(2) : [];
    const names = new Set([normalizeSearchText(ref.name), ...(request ? [request.normalizedExternalCreatorName] : []), ...observations.map(row => row.name)]);
    if (bindings.length || candidate || alias || names.size > 1) result.conflicts++;
    result.pending++;
  }
  return result;
}
