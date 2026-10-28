import "server-only";
import { and, eq } from "drizzle-orm";
import { db } from "@/db";
import type { DbTransaction } from "@/db/transaction";
import { mediaMetadataFactsSql } from "@/db/queries/book-metadata";
import { mediaItems, mediaItemMetadata, providerSnapshots, providerSnapshotLinks } from "@/db/schema";
import { getProviderSnapshot, providerRequestStartedAt, saveProviderSnapshot } from "@/db/queries/provider-snapshots";
import { getActiveProviderRequestTimeoutMs, withProviderTimeout } from "@/lib/covers/providers/shared";
import { BggRequestError } from "@/lib/covers/providers/bgg-runtime";
import type { MediaTitleMetadata, TitleMetadataInput, TitleMetadataOptions } from "@/lib/covers/types";
import { fetchBggXml, type BggFetchDependencies } from "./bgg-fetch";
import { bggProjectionLegacyFacts, describeBggSource, normalizeBggSnapshot, BGG_LEGACY_FACT_KEYS } from "./bgg-adapter";
import { snapshotHash, validateSnapshotReferences, type SnapshotReference } from "./snapshot-values";
import { getBggSnapshotPreview } from "@/db/queries/bgg-snapshot-preview";

export async function getSavedBggBundle(externalId: string) {
  const primary = await getProviderSnapshot(describeBggSource(externalId));
  if (!primary) throw new Error("PROVIDER_SNAPSHOT_MISSING");
  if (snapshotHash(primary.payload) !== primary.payloadHash) throw new Error("PROVIDER_SNAPSHOT_CHANGED");
  return { primary, dependencies: [], projection: normalizeBggSnapshot(primary) };
}
export async function prepareBggSnapshotReferences(externalId: string, refs: SnapshotReference[], executor: DbTransaction | typeof db = db) {
  if (!validateSnapshotReferences(refs) || refs.length !== 1) throw new Error("INVALID_PROVIDER_SNAPSHOT_REFERENCES");
  const descriptor = describeBggSource(externalId);
  const [primary] = await executor.select().from(providerSnapshots).where(eq(providerSnapshots.id, refs[0].id));
  if (!primary || primary.payloadHash !== refs[0].payloadHash || snapshotHash(primary.payload) !== primary.payloadHash) throw new Error("PROVIDER_SNAPSHOT_CHANGED");
  if (primary.providerCode !== descriptor.providerCode || primary.resourceType !== descriptor.resourceType || primary.externalId !== externalId || primary.apiMethod !== descriptor.apiMethod || primary.requestKey !== snapshotHash(descriptor.requestParams) || snapshotHash(primary.requestParams) !== snapshotHash(descriptor.requestParams)) throw new Error("INVALID_PROVIDER_SNAPSHOT_REFERENCES");
  return { primary, dependencies: [], projection: normalizeBggSnapshot(primary) };
}
export async function fetchBggMetadata(input: TitleMetadataInput, options: TitleMetadataOptions, dependencies: BggFetchDependencies = {}): Promise<MediaTitleMetadata> {
  if (input.provider !== "bgg" || input.mediaType !== "boardgame") throw new Error("INVALID_PROVIDER_SNAPSHOT_TARGET");
  options.signal?.throwIfAborted();
  const descriptor = describeBggSource(input.externalId);
  let primary = options.snapshotReuseAfter ? await getProviderSnapshot(descriptor) : null;
  if (!primary || primary.fetchedAt < options.snapshotReuseAfter!) {
    const token = options.providerCredentials?.bgg?.accessToken?.trim();
    if (!token) throw new BggRequestError("provider-unavailable", 401, 60, true);
    const allowed = await options.beforeProviderSearch?.("bgg");
    if (allowed === false || typeof allowed === "string") throw new Error(typeof allowed === "string" ? allowed : "provider-daily-limit");
    const signal = withProviderTimeout(options.requestTimeoutMs ?? getActiveProviderRequestTimeoutMs(), options.signal);
    const requestStartedAt = await providerRequestStartedAt();
    const payload = await fetchBggXml("thing", { id: descriptor.externalId, type: String(descriptor.requestParams.type) }, { token, signal }, dependencies);
    signal.throwIfAborted();
    normalizeBggSnapshot({ ...descriptor, payload });
    primary = await saveProviderSnapshot({ ...descriptor, payload, payloadHash: snapshotHash(payload), contentType: "application/xml", requestStartedAt, fetchedAt: new Date() }, options.snapshotJobGuard);
  }
  options.signal?.throwIfAborted();
  if (snapshotHash(primary.payload) !== primary.payloadHash) throw new Error("PROVIDER_SNAPSHOT_CHANGED");
  const projection = normalizeBggSnapshot(primary);
  return { provider: "bgg", externalId: projection.externalId, sourceUrl: projection.sourceUrl, facts: projection.facts,
    genreFacts: projection.genreFacts, creatorReferences: projection.creatorReferences, fields: projection.fields,
    snapshotReferences: [{ id: primary.id, payloadHash: primary.payloadHash }] };
}
export async function getBggSnapshotFacts(input: {
  mediaItemId: number; mediaType: string; sourceProvider: string | null; sourceExternalId: string | null; facts: Record<string, unknown>;
}, executor: DbTransaction | typeof db = db): Promise<Record<string, unknown>> {
  if (input.mediaType !== "boardgame" || input.sourceProvider !== "bgg" || input.facts.bggSnapshotProcessed !== true) return input.facts;
  if (!input.sourceExternalId) throw new Error("PROVIDER_SNAPSHOT_MISSING");
  const descriptor = describeBggSource(input.sourceExternalId);
  const rows = await executor.select({ snapshot: providerSnapshots }).from(providerSnapshotLinks)
    .innerJoin(providerSnapshots, eq(providerSnapshots.id, providerSnapshotLinks.snapshotId))
    .where(and(eq(providerSnapshotLinks.entityType, "media-item"), eq(providerSnapshotLinks.entityId, String(input.mediaItemId)),
      eq(providerSnapshotLinks.purpose, "primary"), eq(providerSnapshots.providerCode, descriptor.providerCode),
      eq(providerSnapshots.resourceType, descriptor.resourceType), eq(providerSnapshots.externalId, descriptor.externalId),
      eq(providerSnapshots.apiMethod, descriptor.apiMethod), eq(providerSnapshots.requestParams, descriptor.requestParams), eq(providerSnapshots.requestKey, snapshotHash(descriptor.requestParams))));
  if (rows.length !== 1) throw new Error("PROVIDER_SNAPSHOT_MISSING");
  const snapshot = rows[0].snapshot;
  if (snapshotHash(snapshot.payload) !== snapshot.payloadHash || input.facts.bggSnapshotHash !== snapshot.payloadHash) throw new Error("PROVIDER_SNAPSHOT_CHANGED");
  return bggProjectionLegacyFacts(normalizeBggSnapshot(snapshot));
}
export async function isBggSnapshotSupported(id: number) {
  const [row] = await db.select({ mediaType: mediaItems.mediaType, provider: mediaItemMetadata.sourceProvider, externalId: mediaItemMetadata.sourceExternalId }).from(mediaItems)
    .innerJoin(mediaItemMetadata, eq(mediaItemMetadata.mediaItemId, mediaItems.id)).where(eq(mediaItems.id, id));
  return row?.mediaType === "boardgame" && row.provider === "bgg" && Boolean(row.externalId);
}
export async function getBggMigrationComparison(id: number, projection: ReturnType<typeof normalizeBggSnapshot>) {
  const [metadata] = await db.select({ facts: mediaMetadataFactsSql(),storedFacts:mediaItemMetadata.facts }).from(mediaItems)
    .innerJoin(mediaItemMetadata, eq(mediaItemMetadata.mediaItemId, mediaItems.id)).where(eq(mediaItems.id, id));
  const current = metadata?.facts ?? {};
  const proposed = bggProjectionLegacyFacts(projection);
  const { compareBggSnapshotState } = await import("@/db/queries/bgg-snapshot-transfer");
  const preview = await getBggSnapshotPreview(id,metadata?.storedFacts ?? {},projection);
  return { id, current, proposed, legacyKeys: Object.keys(current).filter(key => (BGG_LEGACY_FACT_KEYS as readonly string[]).includes(key)),
    preview,
    blockers: await compareBggSnapshotState(db,id,metadata?.storedFacts ?? {},projection) };
}
