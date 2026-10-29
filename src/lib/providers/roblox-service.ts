import "server-only";
import { eq } from "drizzle-orm";
import { db } from "@/db";
import type { DbTransaction } from "@/db/transaction";
import { mediaItemMetadata, mediaItems, providerSnapshots } from "@/db/schema";
import { getProviderSnapshot, providerRequestStartedAt, saveProviderSnapshot } from "@/db/queries/provider-snapshots";
import type { MediaTitleMetadata, TitleMetadataInput, TitleMetadataOptions } from "@/lib/covers/types";
import { withProviderTimeout } from "@/lib/covers/providers/shared";
import { boundedJson, SnapshotProviderHttpError } from "./book-fetch";
import { describeRobloxSource, normalizeRobloxSnapshot } from "./roblox-adapter";
import { snapshotHash, validateSnapshotReferences, type SnapshotReference } from "./snapshot-values";
import type { JSONValue } from "./types";

export async function getSavedRobloxBundle(externalId: string) {
  const primary = await getProviderSnapshot(describeRobloxSource(externalId));
  if (!primary) throw new Error("PROVIDER_SNAPSHOT_MISSING");
  if (snapshotHash(primary.payload) !== primary.payloadHash) throw new Error("PROVIDER_SNAPSHOT_CHANGED");
  return { primary, dependencies: [], projection: normalizeRobloxSnapshot(primary) };
}

export async function isRobloxSnapshotSupported(id: number) {
  const [row] = await db.select({ mediaType: mediaItems.mediaType, provider: mediaItemMetadata.sourceProvider, externalId: mediaItemMetadata.sourceExternalId })
    .from(mediaItems).innerJoin(mediaItemMetadata, eq(mediaItemMetadata.mediaItemId, mediaItems.id)).where(eq(mediaItems.id, id));
  return row?.mediaType === "roblox" && row.provider === "roblox" && Boolean(row.externalId);
}

export async function prepareRobloxSnapshotReferences(externalId: string, refs: SnapshotReference[], executor: DbTransaction | typeof db = db) {
  if (!validateSnapshotReferences(refs) || refs.length !== 1) throw new Error("INVALID_PROVIDER_SNAPSHOT_REFERENCES");
  const descriptor = describeRobloxSource(externalId);
  const [primary] = await executor.select().from(providerSnapshots).where(eq(providerSnapshots.id, refs[0].id));
  if (!primary || primary.payloadHash !== refs[0].payloadHash || snapshotHash(primary.payload) !== primary.payloadHash) throw new Error("PROVIDER_SNAPSHOT_CHANGED");
  if (primary.providerCode !== descriptor.providerCode || primary.resourceType !== descriptor.resourceType || primary.externalId !== externalId
    || primary.apiMethod !== descriptor.apiMethod || primary.requestKey !== snapshotHash(descriptor.requestParams)
    || snapshotHash(primary.requestParams) !== snapshotHash(descriptor.requestParams)) throw new Error("INVALID_PROVIDER_SNAPSHOT_REFERENCES");
  return { primary, dependencies: [], projection: normalizeRobloxSnapshot(primary) };
}

export async function fetchRobloxMetadata(input: TitleMetadataInput, options: TitleMetadataOptions, fetchImpl: typeof fetch = fetch): Promise<MediaTitleMetadata> {
  if (input.provider !== "roblox" || input.mediaType !== "roblox") throw new Error("INVALID_PROVIDER_SNAPSHOT_TARGET");
  const descriptor = describeRobloxSource(input.externalId);
  let primary = options.snapshotReuseAfter ? await getProviderSnapshot(descriptor) : null;
  if (!primary || primary.fetchedAt < options.snapshotReuseAfter!) {
    const requestStartedAt = await providerRequestStartedAt();
    const signal = withProviderTimeout(options.requestTimeoutMs ?? 8000, options.signal);
    async function request(url: URL): Promise<JSONValue> {
      signal.throwIfAborted();
      const allowed = await options.beforeProviderSearch?.("roblox");
      if (allowed === false || typeof allowed === "string") throw new Error(typeof allowed === "string" ? allowed : "provider-daily-limit");
      const response = await fetchImpl(url, { headers: { accept: "application/json" }, signal, redirect: "error" });
      if (!response.ok) {
        const retry = Number(response.headers.get("retry-after"));
        await response.body?.cancel();
        throw new SnapshotProviderHttpError(response.status, Number.isFinite(retry) && retry > 0 ? Math.ceil(retry) : 60);
      }
      return boundedJson(response);
    }
    const gameUrl = new URL("https://games.roblox.com/v1/games");
    gameUrl.searchParams.set("universeIds", input.externalId);
    const response = await request(gameUrl);
    const games = response && typeof response === "object" && !Array.isArray(response) ? response.data : null;
    const game = Array.isArray(games) ? games.find(value => value && typeof value === "object" && !Array.isArray(value) && value.id === Number(input.externalId)) : null;
    if (!game) throw new Error("INCOMPLETE_PROVIDER_SNAPSHOTS");
    const payload: { [key: string]: JSONValue } = { games: response };
    normalizeRobloxSnapshot({ ...descriptor, payload });
    const gameRecord = game as { [key: string]: JSONValue };
    const creator = gameRecord.creator as { [key: string]: JSONValue };
    for (const [key, path, size] of [["icons", "/v1/games/icons", "512x512"], ["thumbnails", "/v1/games/multiget/thumbnails", "768x432"],
      ["creatorImage", creator.type === "User" ? "/v1/users/avatar-headshot" : "/v1/groups/icons", "420x420"]] as const) {
      const url = new URL(path, "https://thumbnails.roblox.com");
      if (key === "creatorImage") url.searchParams.set(creator.type === "User" ? "userIds" : "groupIds", String(creator.id));
      else url.searchParams.set("universeIds", input.externalId);
      url.searchParams.set("size", size);
      url.searchParams.set("format", "Png");
      url.searchParams.set("isCircular", "false");
      if (key === "icons") url.searchParams.set("returnPolicy", "PlaceHolder");
      else if (key === "thumbnails") { url.searchParams.set("countPerUniverse", "10"); url.searchParams.set("defaults", "true"); }
      try { payload[key] = await request(url); }
      catch (error) {
        if (signal.aborted || error instanceof SnapshotProviderHttpError && error.status === 429
          || error instanceof Error && ["provider-daily-limit", "rate-limit-unavailable"].includes(error.message)) throw error;
      }
    }
    primary = await saveProviderSnapshot({ ...descriptor, payload, payloadHash: snapshotHash(payload), contentType: "application/json", requestStartedAt, fetchedAt: new Date() }, options.snapshotJobGuard);
  }
  if (snapshotHash(primary.payload) !== primary.payloadHash) throw new Error("PROVIDER_SNAPSHOT_CHANGED");
  const projection = normalizeRobloxSnapshot(primary);
  return { provider: "roblox", externalId: projection.externalId, sourceUrl: projection.sourceUrl, fields: projection.fields,
    facts: projection.facts, snapshotReferences: [{ id: primary.id, payloadHash: primary.payloadHash }] };
}
