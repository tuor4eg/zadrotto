import "server-only";
import { and, eq } from "drizzle-orm";
import { db } from "@/db";
import type { DbTransaction } from "@/db/transaction";
import { mediaItems, mediaItemMetadata, providerSnapshots, providerSnapshotLinks } from "@/db/schema";
import { getProviderSnapshot, providerRequestStartedAt, saveProviderSnapshot } from "@/db/queries/provider-snapshots";
import { getActiveProviderRequestTimeoutMs, withProviderTimeout } from "@/lib/covers/providers/shared";
import type { MediaTitleMetadata, TitleMetadataInput, TitleMetadataOptions } from "@/lib/covers/types";
import { boundedJson, SnapshotProviderHttpError } from "./book-fetch";
import { describeTmdbSeriesSource, normalizeTmdbSeriesSnapshot, normalizeTmdbSeriesGenreFacts, TMDB_SERIES_FACT_KEYS } from "./tmdb-series-adapter";
import { snapshotHash, validateSnapshotReferences, type SnapshotReference } from "./snapshot-values";

export async function getSavedTmdbSeriesBundle(externalId: string) {
  const primary = await getProviderSnapshot(describeTmdbSeriesSource(externalId));
  if (!primary) throw new Error("PROVIDER_SNAPSHOT_MISSING");
  return { primary, dependencies: [], projection: normalizeTmdbSeriesSnapshot(primary) };
}
export async function prepareTmdbSeriesSnapshotReferences(externalId: string, refs: SnapshotReference[], executor: DbTransaction | typeof db = db) {
  if (!validateSnapshotReferences(refs) || refs.length !== 1) throw new Error("INVALID_PROVIDER_SNAPSHOT_REFERENCES");
  const descriptor = describeTmdbSeriesSource(externalId);
  const [primary] = await executor.select().from(providerSnapshots).where(eq(providerSnapshots.id, refs[0].id));
  if (!primary || primary.payloadHash !== refs[0].payloadHash) throw new Error("PROVIDER_SNAPSHOT_CHANGED");
  if (primary.providerCode !== "tmdb" || primary.resourceType !== descriptor.resourceType || primary.externalId !== externalId || primary.apiMethod !== descriptor.apiMethod || primary.requestKey !== snapshotHash(descriptor.requestParams)) throw new Error("INVALID_PROVIDER_SNAPSHOT_REFERENCES");
  return { primary, dependencies: [], projection: normalizeTmdbSeriesSnapshot(primary) };
}
export async function fetchTmdbSeriesMetadata(input: TitleMetadataInput, options: TitleMetadataOptions): Promise<MediaTitleMetadata> {
  if (input.provider !== "tmdb" || input.mediaType !== "series") throw new Error("INVALID_PROVIDER_SNAPSHOT_TARGET");
  const descriptor = describeTmdbSeriesSource(input.externalId);
  const token = options.providerCredentials?.tmdb?.accessToken?.trim();
  if (!token) throw new Error("provider-disabled");
  let primary = options.snapshotReuseAfter ? await getProviderSnapshot(descriptor) : null;
  if (!primary || primary.fetchedAt < options.snapshotReuseAfter!) {
    const allowed = await options.beforeProviderSearch?.("tmdb");
    if (allowed === false || typeof allowed === "string") throw new Error(typeof allowed === "string" ? allowed : "provider-daily-limit");
    const url = new URL(`https://api.themoviedb.org/3/tv/${descriptor.externalId}`);
    url.searchParams.set("language", "ru-RU");
    url.searchParams.set("append_to_response", "aggregate_credits");
    const requestStartedAt = await providerRequestStartedAt();
    const response = await fetch(url, { headers: { Authorization: `Bearer ${token}`, accept: "application/json" }, redirect: "error", signal: withProviderTimeout(getActiveProviderRequestTimeoutMs(), options.signal) });
    if (!response.ok) {
      const retry = response.headers.get("retry-after");
      const retrySeconds = retry && /^\d+$/.test(retry) ? Number(retry) : retry ? Math.ceil((Date.parse(retry) - Date.now()) / 1000) : 60;
      await response.body?.cancel();
      throw new SnapshotProviderHttpError(response.status, Number.isFinite(retrySeconds) ? Math.max(1, retrySeconds) : 60);
    }
    const payload = await boundedJson(response);
    normalizeTmdbSeriesSnapshot({ ...descriptor, payload });
    primary = await saveProviderSnapshot({ ...descriptor, payload, payloadHash: snapshotHash(payload), contentType: response.headers.get("content-type") ?? "application/json", requestStartedAt, fetchedAt: new Date() }, options.snapshotJobGuard);
  }
  const projection = normalizeTmdbSeriesSnapshot(primary);
  return { provider: "tmdb", externalId: projection.externalId, sourceUrl: projection.sourceUrl, facts: projection.facts, genreFacts: projection.genreFacts, parts: projection.parts,
    snapshotReferences: [{ id: primary.id, payloadHash: primary.payloadHash }], ...(options.enrichTitleFields ? { fields: projection.fields } : {}) };
}

export async function getTmdbSeriesMigrationComparison(id: number, projection: ReturnType<typeof normalizeTmdbSeriesSnapshot>) {
  const [metadata] = await db.select({ facts: mediaItemMetadata.facts }).from(mediaItemMetadata).where(eq(mediaItemMetadata.mediaItemId, id));
  const current = metadata?.facts ?? {};
  return { id, current, proposed: projection.facts, legacyKeys: Object.keys(current).filter(key => !(TMDB_SERIES_FACT_KEYS as readonly string[]).includes(key)),
    blockers: TMDB_SERIES_FACT_KEYS.filter(key => key in current && (!(key in projection.facts) || snapshotHash(current[key] as import("./types").JSONValue) !== snapshotHash(projection.facts[key] as import("./types").JSONValue))).map(key => `facts-difference:${key}`) };
}

export async function isTmdbSeriesSnapshotSupported(id: number) {
  const [row] = await db.select({mediaType:mediaItems.mediaType,provider:mediaItemMetadata.sourceProvider,externalId:mediaItemMetadata.sourceExternalId}).from(mediaItems)
    .innerJoin(mediaItemMetadata,eq(mediaItemMetadata.mediaItemId,mediaItems.id)).where(eq(mediaItems.id,id));
  return row?.mediaType === "series" && row.provider === "tmdb" && Boolean(row.externalId);
}

/** Moderation reads provider evidence, never denormalizes genres back into facts.
 * Legacy facts remain readable until the guarded cleanup migration succeeds. */
export async function getTmdbSeriesGenreFacts(input: {
  mediaItemId: number; mediaType: string; sourceProvider: string | null;
  sourceExternalId: string | null; facts: Record<string, unknown>;
}, executor: DbTransaction | typeof db = db): Promise<Record<string, unknown>> {
  if (input.mediaType !== "series" || input.sourceProvider !== "tmdb") return input.facts;
  if (!input.sourceExternalId) throw new Error("PROVIDER_SNAPSHOT_MISSING");
  const descriptor = describeTmdbSeriesSource(input.sourceExternalId);
  const rows = await executor.select({ snapshot: providerSnapshots }).from(providerSnapshotLinks)
    .innerJoin(providerSnapshots, eq(providerSnapshots.id, providerSnapshotLinks.snapshotId))
    .where(and(eq(providerSnapshotLinks.entityType, "media-item"), eq(providerSnapshotLinks.entityId, String(input.mediaItemId)),
      eq(providerSnapshotLinks.purpose, "primary"), eq(providerSnapshots.providerCode, "tmdb"),
      eq(providerSnapshots.resourceType, descriptor.resourceType), eq(providerSnapshots.externalId, input.sourceExternalId),
      eq(providerSnapshots.apiMethod, descriptor.apiMethod), eq(providerSnapshots.requestParams, descriptor.requestParams),
      eq(providerSnapshots.requestKey, snapshotHash(descriptor.requestParams))));
  if (rows.length === 1) return normalizeTmdbSeriesGenreFacts(rows[0].snapshot);
  if (rows.length === 0 && ("genres" in input.facts || "genreReferences" in input.facts)) return input.facts;
  throw new Error("PROVIDER_SNAPSHOT_MISSING");
}
