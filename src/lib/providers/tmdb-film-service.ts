import "server-only";
import { and, eq } from "drizzle-orm";
import { db } from "@/db";
import type { DbTransaction } from "@/db/transaction";
import { mediaItems, mediaItemMetadata, providerSnapshots, providerSnapshotLinks } from "@/db/schema";
import { getProviderSnapshot, providerRequestStartedAt, saveProviderSnapshot } from "@/db/queries/provider-snapshots";
import { getActiveProviderRequestTimeoutMs, withProviderTimeout } from "@/lib/covers/providers/shared";
import type { MediaTitleMetadata, TitleMetadataInput, TitleMetadataOptions } from "@/lib/covers/types";
import { boundedJson, SnapshotProviderHttpError } from "./book-fetch";
import { describeTmdbFilmSource, normalizeTmdbFilmSnapshot, normalizeTmdbFilmGenreFacts, TMDB_FILM_FACT_KEYS } from "./tmdb-film-adapter";
import { snapshotHash, validateSnapshotReferences, type SnapshotReference } from "./snapshot-values";

export async function getSavedTmdbFilmBundle(externalId: string) {
  const primary = await getProviderSnapshot(describeTmdbFilmSource(externalId));
  if (!primary) throw new Error("PROVIDER_SNAPSHOT_MISSING");
  return { primary, dependencies: [], projection: normalizeTmdbFilmSnapshot(primary) };
}
export async function prepareTmdbFilmSnapshotReferences(externalId: string, refs: SnapshotReference[], executor: DbTransaction | typeof db = db) {
  if (!validateSnapshotReferences(refs) || refs.length !== 1) throw new Error("INVALID_PROVIDER_SNAPSHOT_REFERENCES");
  const descriptor = describeTmdbFilmSource(externalId);
  const [primary] = await executor.select().from(providerSnapshots).where(eq(providerSnapshots.id, refs[0].id));
  if (!primary || primary.payloadHash !== refs[0].payloadHash) throw new Error("PROVIDER_SNAPSHOT_CHANGED");
  if (primary.providerCode !== "tmdb" || primary.resourceType !== descriptor.resourceType || primary.externalId !== externalId || primary.apiMethod !== descriptor.apiMethod || primary.requestKey !== snapshotHash(descriptor.requestParams)) throw new Error("INVALID_PROVIDER_SNAPSHOT_REFERENCES");
  return { primary, dependencies: [], projection: normalizeTmdbFilmSnapshot(primary) };
}
export async function fetchTmdbFilmMetadata(input: TitleMetadataInput, options: TitleMetadataOptions): Promise<MediaTitleMetadata> {
  if (input.provider !== "tmdb" || input.mediaType !== "film") throw new Error("INVALID_PROVIDER_SNAPSHOT_TARGET");
  const descriptor = describeTmdbFilmSource(input.externalId);
  const token = options.providerCredentials?.tmdb?.accessToken?.trim();
  if (!token) throw new Error("provider-disabled");
  let primary = options.snapshotReuseAfter ? await getProviderSnapshot(descriptor) : null;
  if (!primary || primary.fetchedAt < options.snapshotReuseAfter!) {
    const allowed = await options.beforeProviderSearch?.("tmdb");
    if (allowed === false || typeof allowed === "string") throw new Error(typeof allowed === "string" ? allowed : "provider-daily-limit");
    const url = new URL(`https://api.themoviedb.org/3/movie/${descriptor.externalId}`);
    url.searchParams.set("language", "ru-RU");
    url.searchParams.set("append_to_response", "credits");
    const requestStartedAt = await providerRequestStartedAt();
    const response = await fetch(url, { headers: { Authorization: `Bearer ${token}`, accept: "application/json" }, redirect: "error", signal: withProviderTimeout(getActiveProviderRequestTimeoutMs(), options.signal) });
    if (!response.ok) {
      const retry = response.headers.get("retry-after");
      const retrySeconds = retry && /^\d+$/.test(retry) ? Number(retry) : retry ? Math.ceil((Date.parse(retry) - Date.now()) / 1000) : 60;
      await response.body?.cancel();
      throw new SnapshotProviderHttpError(response.status, Number.isFinite(retrySeconds) ? Math.max(1, retrySeconds) : 60);
    }
    const payload = await boundedJson(response);
    normalizeTmdbFilmSnapshot({ ...descriptor, payload });
    primary = await saveProviderSnapshot({ ...descriptor, payload, payloadHash: snapshotHash(payload), contentType: response.headers.get("content-type") ?? "application/json", requestStartedAt, fetchedAt: new Date() }, options.snapshotJobGuard);
  }
  const projection = normalizeTmdbFilmSnapshot(primary);
  return { provider: "tmdb", externalId: projection.externalId, sourceUrl: projection.sourceUrl, facts: projection.facts, genreFacts: projection.genreFacts,
    snapshotReferences: [{ id: primary.id, payloadHash: primary.payloadHash }] };
}

export async function getTmdbFilmMigrationComparison(id: number, projection: ReturnType<typeof normalizeTmdbFilmSnapshot>) {
  const [metadata] = await db.select({ facts: mediaItemMetadata.facts }).from(mediaItemMetadata).where(eq(mediaItemMetadata.mediaItemId, id));
  const current = metadata?.facts ?? {};
  return { id, current, proposed: projection.facts, legacyKeys: Object.keys(current).filter(key => !(TMDB_FILM_FACT_KEYS as readonly string[]).includes(key)),
    blockers: TMDB_FILM_FACT_KEYS.filter(key => key in current && (!(key in projection.facts) || snapshotHash(current[key] as import("./types").JSONValue) !== snapshotHash(projection.facts[key] as import("./types").JSONValue))).map(key => `facts-difference:${key}`) };
}

export async function isTmdbFilmSnapshotSupported(id: number) {
  const [row] = await db.select({mediaType:mediaItems.mediaType,provider:mediaItemMetadata.sourceProvider,externalId:mediaItemMetadata.sourceExternalId}).from(mediaItems)
    .innerJoin(mediaItemMetadata,eq(mediaItemMetadata.mediaItemId,mediaItems.id)).where(eq(mediaItems.id,id));
  return row?.mediaType === "film" && row.provider === "tmdb" && Boolean(row.externalId);
}

/** Moderation reads provider evidence, never denormalizes genres back into facts.
 * Legacy facts remain readable until the guarded cleanup migration succeeds. */
export async function getTmdbFilmGenreFacts(input: {
  mediaItemId: number; mediaType: string; sourceProvider: string | null;
  sourceExternalId: string | null; facts: Record<string, unknown>;
}, executor: DbTransaction | typeof db = db): Promise<Record<string, unknown>> {
  if (input.mediaType !== "film" || input.sourceProvider !== "tmdb") return input.facts;
  if (!input.sourceExternalId) throw new Error("PROVIDER_SNAPSHOT_MISSING");
  const descriptor = describeTmdbFilmSource(input.sourceExternalId);
  const rows = await executor.select({ snapshot: providerSnapshots }).from(providerSnapshotLinks)
    .innerJoin(providerSnapshots, eq(providerSnapshots.id, providerSnapshotLinks.snapshotId))
    .where(and(eq(providerSnapshotLinks.entityType, "media-item"), eq(providerSnapshotLinks.entityId, String(input.mediaItemId)),
      eq(providerSnapshotLinks.purpose, "primary"), eq(providerSnapshots.providerCode, "tmdb"),
      eq(providerSnapshots.resourceType, descriptor.resourceType), eq(providerSnapshots.externalId, input.sourceExternalId),
      eq(providerSnapshots.apiMethod, descriptor.apiMethod), eq(providerSnapshots.requestParams, descriptor.requestParams),
      eq(providerSnapshots.requestKey, snapshotHash(descriptor.requestParams))));
  if (rows.length === 1) return normalizeTmdbFilmGenreFacts(rows[0].snapshot);
  if (rows.length === 0 && ("genres" in input.facts || "genreReferences" in input.facts)) return input.facts;
  throw new Error("PROVIDER_SNAPSHOT_MISSING");
}
