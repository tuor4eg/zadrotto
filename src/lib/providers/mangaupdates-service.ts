import "server-only";
import { createHash } from "node:crypto";
import { setTimeout as delay } from "node:timers/promises";
import { getRedisClient } from "@/lib/services/redis";
import { and, eq } from "drizzle-orm";
import { db } from "@/db";
import type { DbTransaction } from "@/db/transaction";
import { providerSnapshots, providerSnapshotLinks } from "@/db/schema";
import { getProviderSnapshot, providerRequestStartedAt, saveProviderSnapshot } from "@/db/queries/provider-snapshots";
import type { MediaTitleMetadata, TitleMetadataInput, TitleMetadataOptions } from "@/lib/covers/types";
import { getActiveProviderRequestTimeoutMs, withProviderTimeout } from "@/lib/covers/providers/shared";
import { boundedJson, SnapshotProviderHttpError } from "./book-fetch";
import type { JSONValue } from "./types";
import { describeMangaUpdatesSeries, normalizeMangaUpdatesSnapshot } from "./mangaupdates-adapter";
import { snapshotHash, validateSnapshotReferences, type SnapshotReference } from "./snapshot-values";

export function mangaUpdatesRetryAfterSeconds(value: string | null, now = Date.now()) {
  const seconds = value === null ? NaN : Number(value);
  if (Number.isFinite(seconds) && seconds >= 0) return Math.max(1, Math.ceil(seconds));
  const date = value === null ? NaN : Date.parse(value);
  return Number.isFinite(date) ? Math.max(1, Math.ceil((date - now) / 1000)) : 60;
}
// Operational courtesy spacing, not an advertised numeric MangaUpdates API limit.
const REQUEST_SLOT = "local ttl = redis.call('PTTL', KEYS[1]); if ttl > 0 then return ttl end redis.call('SET', KEYS[1], '1', 'PX', 1000); return 0";
const COOLDOWN = "local ttl = redis.call('PTTL', KEYS[1]); if ttl < tonumber(ARGV[1]) then redis.call('SET', KEYS[1], '1', 'PX', ARGV[1]) end return 0";
export async function requestMangaUpdates(path: string, options: TitleMetadataOptions, body?: Record<string, JSONValue>, fetchImpl: typeof fetch = fetch): Promise<JSONValue> {
  const signal = options.signal ?? AbortSignal.timeout(120_000);
  const redis = await getRedisClient();
  if (!redis) throw new Error("rate-limit-unavailable");
  const cacheKey = body ? `mangaupdates:search:v1:${createHash("sha256").update(JSON.stringify(body)).digest("hex")}` : null;
  if (cacheKey && !options.bypassCache) {
    const cached = await redis.get(cacheKey);
    if (cached !== null) return JSON.parse(cached) as JSONValue;
  }
  while (true) {
    signal.throwIfAborted();
    const wait = Number(await redis.eval(REQUEST_SLOT, { keys: ["mangaupdates:request-slot:v1"], arguments: [] }));
    if (!Number.isFinite(wait) || wait < 0) throw new Error("rate-limit-unavailable");
    if (wait === 0) break;
    if (wait > 1000) throw new SnapshotProviderHttpError(429, Math.ceil(wait / 1000));
    await delay(wait, undefined, { signal });
  }
  const allowed = await options.beforeProviderSearch?.("mangaupdates");
  if (allowed === false || typeof allowed === "string") throw new Error(typeof allowed === "string" ? allowed : "provider-daily-limit");
  const response = await fetchImpl(`https://api.mangaupdates.com/v1/${path}`, { method: body ? "POST" : "GET", headers: { accept: "application/json", ...(body ? { "content-type": "application/json" } : {}) }, ...(body ? { body: JSON.stringify(body) } : {}), redirect: "error", signal: withProviderTimeout(options.requestTimeoutMs ?? getActiveProviderRequestTimeoutMs(), signal) });
  if (!response.ok) {
    const retry = mangaUpdatesRetryAfterSeconds(response.headers.get("retry-after"));
    await response.body?.cancel();
    if (response.status === 429) await redis.eval(COOLDOWN, { keys: ["mangaupdates:request-slot:v1"], arguments: [String(retry * 1000)] });
    throw new SnapshotProviderHttpError(response.status, retry);
  }
  const payload = await boundedJson(response);
  if (body && (!payload || typeof payload !== "object" || Array.isArray(payload) || !Array.isArray(payload.results))) throw new Error("INCOMPLETE_PROVIDER_SNAPSHOTS");
  if (cacheKey && !options.bypassCache) await redis.set(cacheKey, JSON.stringify(payload), { EX: 3600 });
  return payload;
}
export async function prepareMangaUpdatesSnapshotReferences(externalId: string, refs: SnapshotReference[], executor: DbTransaction | typeof db = db) {
  if (!validateSnapshotReferences(refs) || refs.length !== 1) throw new Error("INVALID_PROVIDER_SNAPSHOT_REFERENCES");
  const descriptor = describeMangaUpdatesSeries(externalId);
  const [primary] = await executor.select().from(providerSnapshots).where(eq(providerSnapshots.id, refs[0].id));
  if (!primary || primary.payloadHash !== refs[0].payloadHash || snapshotHash(primary.payload) !== primary.payloadHash) throw new Error("PROVIDER_SNAPSHOT_CHANGED");
  if (primary.providerCode !== descriptor.providerCode || primary.resourceType !== descriptor.resourceType || primary.externalId !== externalId || primary.apiMethod !== descriptor.apiMethod || primary.requestKey !== snapshotHash(descriptor.requestParams) || snapshotHash(primary.requestParams) !== snapshotHash(descriptor.requestParams)) throw new Error("INVALID_PROVIDER_SNAPSHOT_REFERENCES");
  return { primary, projection: normalizeMangaUpdatesSnapshot(primary) };
}
export async function getSavedMangaUpdatesBundle(mediaItemId: number, externalId: string, executor: DbTransaction | typeof db = db) {
  const descriptor = describeMangaUpdatesSeries(externalId);
  const [linked] = await executor.select({ snapshot: providerSnapshots }).from(providerSnapshotLinks).innerJoin(providerSnapshots, eq(providerSnapshots.id, providerSnapshotLinks.snapshotId)).where(and(eq(providerSnapshotLinks.entityType, "media-item"), eq(providerSnapshotLinks.entityId, String(mediaItemId)), eq(providerSnapshotLinks.purpose, "primary"), eq(providerSnapshots.providerCode, descriptor.providerCode), eq(providerSnapshots.resourceType, descriptor.resourceType), eq(providerSnapshots.externalId, externalId), eq(providerSnapshots.apiMethod, descriptor.apiMethod), eq(providerSnapshots.requestKey, snapshotHash(descriptor.requestParams))));
  if (!linked) throw new Error("PROVIDER_SNAPSHOT_MISSING");
  return prepareMangaUpdatesSnapshotReferences(externalId, [{ id: linked.snapshot.id, payloadHash: linked.snapshot.payloadHash }], executor);
}
export async function fetchMangaUpdatesMetadata(input: TitleMetadataInput, options: TitleMetadataOptions, fetchImpl: typeof fetch = fetch): Promise<MediaTitleMetadata> {
  if (input.provider !== "mangaupdates" || input.mediaType !== "manga") throw new Error("INVALID_PROVIDER_SNAPSHOT_TARGET");
  const descriptor = describeMangaUpdatesSeries(input.externalId);
  let primary = options.snapshotReuseAfter && !options.bypassCache ? await getProviderSnapshot(descriptor) : null;
  if (!primary || primary.fetchedAt < options.snapshotReuseAfter!) {
    const requestStartedAt = await providerRequestStartedAt();
    const payload = await requestMangaUpdates(`series/${input.externalId}`, options, undefined, fetchImpl);
    normalizeMangaUpdatesSnapshot({ ...descriptor, payload });
    primary = await saveProviderSnapshot({ ...descriptor, payload, payloadHash: snapshotHash(payload), contentType: "application/json", requestStartedAt, fetchedAt: new Date() }, options.snapshotJobGuard);
  }
  if (snapshotHash(primary.payload) !== primary.payloadHash) throw new Error("PROVIDER_SNAPSHOT_CHANGED");
  const projection = normalizeMangaUpdatesSnapshot(primary);
  return { provider: "mangaupdates", externalId: input.externalId, sourceUrl: projection.sourceUrl, fields: projection.fields, facts: projection.facts, genreFacts: projection.facts, snapshotReferences: [{ id: primary.id, payloadHash: primary.payloadHash }] };
}
