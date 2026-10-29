import "server-only";
import { and, eq, inArray } from "drizzle-orm";
import { db } from "@/db";
import { providerSnapshots, mediaItems, mediaItemMetadata } from "@/db/schema";
import type { DbTransaction } from "@/db/transaction";
import { getProviderSnapshot, providerRequestStartedAt, saveProviderSnapshot } from "@/db/queries/provider-snapshots";
import { getActiveProviderRequestTimeoutMs, withProviderTimeout } from "@/lib/covers/providers/shared";
import type { MediaTitleMetadata, TitleMetadataInput, TitleMetadataOptions } from "@/lib/covers/types";
import { boundedJson, SnapshotProviderHttpError } from "./book-fetch";
import { describeComicVineIssue, describeComicVineVolume, normalizeComicVineIssue, normalizeComicVineVolume } from "./comic-vine-adapter";
import { snapshotHash, validateSnapshotReferences, type SnapshotReference } from "./snapshot-values";
import type { SnapshotDescriptor } from "./types";

export async function prepareComicVineSnapshotReferences(externalId: string, refs: SnapshotReference[], executor: DbTransaction | typeof db = db) {
  if (!validateSnapshotReferences(refs) || refs.length > 2) throw new Error("INVALID_PROVIDER_SNAPSHOT_REFERENCES");
  const rows = await executor.select().from(providerSnapshots).where(inArray(providerSnapshots.id, refs.map(ref => ref.id)));
  if (rows.length !== refs.length || rows.some(row => refs.find(ref => ref.id === row.id)?.payloadHash !== row.payloadHash || snapshotHash(row.payload) !== row.payloadHash)) throw new Error("PROVIDER_SNAPSHOT_CHANGED");
  const descriptor = describeComicVineVolume(externalId);
  const primary = rows.find(row => row.providerCode === descriptor.providerCode && row.resourceType === descriptor.resourceType && row.externalId === descriptor.externalId && row.apiMethod === descriptor.apiMethod && row.requestKey === snapshotHash(descriptor.requestParams) && snapshotHash(row.requestParams) === snapshotHash(descriptor.requestParams));
  if (!primary) throw new Error("INVALID_PROVIDER_SNAPSHOT_REFERENCES");
  const projection = normalizeComicVineVolume(primary);
  const issue = rows.find(row => row.id !== primary.id);
  if (issue) {
    if (!projection.firstIssueId) throw new Error("INVALID_PROVIDER_SNAPSHOT_REFERENCES");
    const expected = describeComicVineIssue(projection.firstIssueId);
    if (issue.providerCode !== expected.providerCode || issue.resourceType !== expected.resourceType || issue.externalId !== expected.externalId || issue.apiMethod !== expected.apiMethod || issue.requestKey !== snapshotHash(expected.requestParams) || snapshotHash(issue.requestParams) !== snapshotHash(expected.requestParams)) throw new Error("INVALID_PROVIDER_SNAPSHOT_REFERENCES");
  }
  return { primary, issue: issue ?? null, projection, issueCreators: issue ? normalizeComicVineIssue(issue, externalId) : null };
}

async function fetchSnapshot(descriptor: SnapshotDescriptor, options: TitleMetadataOptions, volumeId?: string) {
  const cached = options.snapshotReuseAfter ? await getProviderSnapshot(descriptor) : null;
  if (cached && cached.fetchedAt >= options.snapshotReuseAfter!) return cached;
  const apiKey = options.providerCredentials?.["comic-vine"]?.apiKey?.trim();
  if (!apiKey) throw new Error("provider-disabled");
  const allowed = await options.beforeProviderSearch?.("comic-vine");
  if (allowed === false || typeof allowed === "string") throw new Error(typeof allowed === "string" ? allowed : "provider-daily-limit");
  const url = new URL(`https://comicvine.gamespot.com/api/${descriptor.resourceType}/${descriptor.resourceType === "volume" ? "4050" : "4000"}-${descriptor.externalId}/`);
  url.searchParams.set("api_key", apiKey);
  url.searchParams.set("format", "json");
  const requestStartedAt = await providerRequestStartedAt();
  const response = await fetch(url, { headers: { "User-Agent": "geekoteka/1.0 comic archive", accept: "application/json" }, redirect: "error", signal: withProviderTimeout(options.requestTimeoutMs ?? getActiveProviderRequestTimeoutMs(), options.signal) });
  if (!response.ok) { await response.body?.cancel(); throw new SnapshotProviderHttpError(response.status, 60); }
  const payload = await boundedJson(response);
  if (!payload || typeof payload !== "object" || Array.isArray(payload) || payload.status_code !== 1 || !payload.results) throw new Error("INCOMPLETE_PROVIDER_SNAPSHOTS");
  if (descriptor.resourceType === "volume") normalizeComicVineVolume({ ...descriptor, payload });
  else if (volumeId) normalizeComicVineIssue({ ...descriptor, payload }, volumeId);
  return saveProviderSnapshot({ ...descriptor, payload, payloadHash: snapshotHash(payload), contentType: "application/json", requestStartedAt, fetchedAt: new Date() }, options.snapshotJobGuard);
}

export async function fetchComicVineMetadata(input: TitleMetadataInput, options: TitleMetadataOptions): Promise<MediaTitleMetadata> {
  if (input.provider !== "comic-vine" || input.mediaType !== "comic") throw new Error("INVALID_PROVIDER_SNAPSHOT_TARGET");
  const primary = await fetchSnapshot(describeComicVineVolume(input.externalId), options);
  const projection = normalizeComicVineVolume(primary);
  let issue: typeof primary | null = null;
  if (projection.firstIssueId) {
    try {
      const candidate = await fetchSnapshot(describeComicVineIssue(projection.firstIssueId), options, input.externalId);
      normalizeComicVineIssue(candidate, input.externalId);
      issue = candidate;
    } catch (error) {
      options.signal?.throwIfAborted();
      if (error instanceof Error && (error.message === "STALE_SNAPSHOT_JOB" || ("code" in error && error.code === "lease-lost"))) throw error;
    }
  }
  return { provider: "comic-vine", externalId: input.externalId, sourceUrl: projection.sourceUrl, facts: projection.facts,
    snapshotReferences: [primary, ...(issue ? [issue] : [])].map(row => ({ id: row.id, payloadHash: row.payloadHash })) };
}

export async function getSavedComicVineBundle(mediaItemId: number, externalId: string) {
  const { providerSnapshotLinks } = await import("@/db/schema");
  const [linked] = await db.select({ snapshot: providerSnapshots }).from(providerSnapshotLinks)
    .innerJoin(providerSnapshots, eq(providerSnapshots.id, providerSnapshotLinks.snapshotId))
    .where(and(eq(providerSnapshotLinks.entityType, "media-item"), eq(providerSnapshotLinks.entityId, String(mediaItemId)), eq(providerSnapshotLinks.purpose, "primary"), eq(providerSnapshots.providerCode, "comic-vine"), eq(providerSnapshots.resourceType, "volume"), eq(providerSnapshots.externalId, externalId), eq(providerSnapshots.apiMethod, "volume.details"), eq(providerSnapshots.requestKey, snapshotHash({ version: 1 }))));
  const primary = linked?.snapshot;
  if (!primary) throw new Error("PROVIDER_SNAPSHOT_MISSING");
  const projection = normalizeComicVineVolume(primary);
  const { providerPartSnapshotLinks } = await import("@/db/schema");
  const rows = projection.firstIssueId ? await db.select({ snapshot: providerSnapshots }).from(providerPartSnapshotLinks)
    .innerJoin(providerSnapshots, eq(providerSnapshots.id, providerPartSnapshotLinks.snapshotId))
    .where(and(eq(providerPartSnapshotLinks.mediaItemId, mediaItemId), eq(providerSnapshots.providerCode, "comic-vine"), eq(providerSnapshots.resourceType, "issue"), eq(providerSnapshots.externalId, projection.firstIssueId))) : [];
  const issue = rows.map(row => row.snapshot).find(row => row.providerCode === "comic-vine" && row.resourceType === "issue" && row.externalId === projection.firstIssueId && row.apiMethod === "issue.details" && row.requestKey === snapshotHash({ version: 1 }));
  const references = [primary, ...(issue ? [issue] : [])].map(row => ({ id: row.id, payloadHash: row.payloadHash }));
  return prepareComicVineSnapshotReferences(externalId, references);
}

export async function isComicVineSnapshotSupported(id: number) {
  const [row] = await db.select({ mediaType: mediaItems.mediaType, provider: mediaItemMetadata.sourceProvider, externalId: mediaItemMetadata.sourceExternalId }).from(mediaItems)
    .innerJoin(mediaItemMetadata, eq(mediaItemMetadata.mediaItemId, mediaItems.id)).where(eq(mediaItems.id, id));
  return row?.mediaType === "comic" && row.provider === "comic-vine" && Boolean(row.externalId);
}
