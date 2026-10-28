import "server-only";
import { and, eq } from "drizzle-orm";
import { db } from "@/db";
import type { DbTransaction } from "@/db/transaction";
import { mediaMetadataFactsSql } from "@/db/queries/book-metadata";
import { mediaItems, mediaItemMetadata, providerSnapshots, providerSnapshotLinks } from "@/db/schema";
import { getProviderSnapshot, providerRequestStartedAt, saveProviderSnapshot } from "@/db/queries/provider-snapshots";
import { fetchGameProvider } from "@/lib/covers/game-provider-budget";
import { getIgdbAccessToken } from "@/lib/covers/providers/igdb";
import { getActiveProviderRequestTimeoutMs, withProviderTimeout } from "@/lib/covers/providers/shared";
import type { MediaTitleMetadata, TitleMetadataInput, TitleMetadataOptions } from "@/lib/covers/types";
import type { fetchRawgJson } from "@/lib/creators/game-company-api";
import { boundedJson, SnapshotProviderHttpError } from "./book-fetch";
import { describeGameSource, normalizeGameSnapshot, GAME_LEGACY_FACT_KEYS, IGDB_GAME_SNAPSHOT_FIELDS, type GameSnapshotProvider } from "./game-adapter";
import { snapshotHash, validateSnapshotReferences, type SnapshotReference } from "./snapshot-values";

export async function getSavedGameBundle(provider: GameSnapshotProvider, externalId: string) {
  const primary = await getProviderSnapshot(describeGameSource(provider, externalId));
  if (!primary) throw new Error("PROVIDER_SNAPSHOT_MISSING");
  if (snapshotHash(primary.payload) !== primary.payloadHash) throw new Error("PROVIDER_SNAPSHOT_CHANGED");
  return { primary, dependencies: [], projection: normalizeGameSnapshot(primary) };
}
export async function prepareGameSnapshotReferences(provider: GameSnapshotProvider, externalId: string, refs: SnapshotReference[], executor: DbTransaction | typeof db = db) {
  if (!validateSnapshotReferences(refs) || refs.length !== 1) throw new Error("INVALID_PROVIDER_SNAPSHOT_REFERENCES");
  const descriptor = describeGameSource(provider, externalId);
  const [primary] = await executor.select().from(providerSnapshots).where(eq(providerSnapshots.id, refs[0].id));
  if (!primary || primary.payloadHash !== refs[0].payloadHash || snapshotHash(primary.payload) !== primary.payloadHash) throw new Error("PROVIDER_SNAPSHOT_CHANGED");
  if (primary.providerCode !== provider || primary.resourceType !== descriptor.resourceType || primary.externalId !== externalId || primary.apiMethod !== descriptor.apiMethod || primary.requestKey !== snapshotHash(descriptor.requestParams) || snapshotHash(primary.requestParams) !== snapshotHash(descriptor.requestParams)) throw new Error("INVALID_PROVIDER_SNAPSHOT_REFERENCES");
  return { primary, dependencies: [], projection: normalizeGameSnapshot(primary) };
}

type GameMetadataDependencies = { igdbRequest?: typeof fetchGameProvider; rawgRequest?: typeof fetchRawgJson };
export async function fetchGameMetadata(input: TitleMetadataInput, options: TitleMetadataOptions, dependencies: GameMetadataDependencies = {}): Promise<MediaTitleMetadata> {
  if ((input.provider !== "igdb" && input.provider !== "rawg") || input.mediaType !== "game") throw new Error("INVALID_PROVIDER_SNAPSHOT_TARGET");
  options.signal?.throwIfAborted();
  const provider = input.provider;
  const descriptor = describeGameSource(provider, input.externalId);
  const credentials = options.providerCredentials?.[provider];
  if (provider === "igdb" ? !credentials?.clientId?.trim() || !credentials?.clientSecret?.trim() : !credentials?.apiKey?.trim()) throw new Error("provider-disabled");
  let primary = options.snapshotReuseAfter ? await getProviderSnapshot(descriptor) : null;
  if (!primary || primary.fetchedAt < options.snapshotReuseAfter!) {
    const allowed = await options.beforeProviderSearch?.(provider);
    if (allowed === false || typeof allowed === "string") throw new Error(typeof allowed === "string" ? allowed : "provider-daily-limit");
    const requestStartedAt = await providerRequestStartedAt();
    const signal = withProviderTimeout(getActiveProviderRequestTimeoutMs(), options.signal);
    let payload;
    let contentType = "application/json";
    if (provider === "rawg" && dependencies.rawgRequest) {
      const url = new URL(`https://api.rawg.io/api/games/${descriptor.externalId}`);
      url.searchParams.set("key", credentials!.apiKey.trim());
      payload = await dependencies.rawgRequest<import("./types").JSONValue>(url, { signal }, Boolean(options.snapshotJobGuard));
    } else {
      let url: string | URL;
      let init: RequestInit;
      if (provider === "igdb") {
        const accessToken = await getIgdbAccessToken({ clientId: credentials!.clientId.trim(), clientSecret: credentials!.clientSecret.trim() });
        if (!accessToken) throw new Error("provider-disabled");
        options.signal?.throwIfAborted();
        url = "https://api.igdb.com/v4/games";
        init = { method: "POST", headers: { accept: "application/json", "Client-ID": credentials!.clientId.trim(), Authorization: `Bearer ${accessToken}` },
          body: `fields ${IGDB_GAME_SNAPSHOT_FIELDS}; where id = ${descriptor.externalId}; limit 1;`, signal };
      } else {
        url = new URL(`https://api.rawg.io/api/games/${descriptor.externalId}`);
        url.searchParams.set("key", credentials!.apiKey.trim());
        init = { signal };
      }
      const response = await (dependencies.igdbRequest ?? fetchGameProvider)(provider, url, init, Boolean(options.snapshotJobGuard));
      if (!response.ok) {
        const retry = response.headers.get("retry-after");
        const seconds = retry && /^\d+$/.test(retry) ? Number(retry) : retry ? Math.ceil((Date.parse(retry) - Date.now()) / 1000) : 60;
        await response.body?.cancel();
        throw new SnapshotProviderHttpError(response.status, Number.isFinite(seconds) ? Math.max(1, seconds) : 60);
      }
      payload = await boundedJson(response);
      contentType = response.headers.get("content-type") ?? contentType;
    }
    options.signal?.throwIfAborted();
    normalizeGameSnapshot({ ...descriptor, payload });
    primary = await saveProviderSnapshot({ ...descriptor, payload, payloadHash: snapshotHash(payload), contentType, requestStartedAt, fetchedAt: new Date() }, options.snapshotJobGuard);
  }
  const projection = normalizeGameSnapshot(primary);
  return { provider, externalId: projection.externalId, sourceUrl: projection.sourceUrl, facts: projection.facts,
    genreFacts: projection.genreFacts, platformFacts: projection.platformFacts, companyReferences: projection.companyReferences, fields: projection.fields,
    snapshotReferences: [{ id: primary.id, payloadHash: primary.payloadHash }] };
}

function moderationFacts(projection: ReturnType<typeof normalizeGameSnapshot>) {
  return { ...projection.genreFacts, ...projection.platformFacts, gameCompanyReferences: projection.companyReferences,
    developers: [...new Set(projection.companyReferences.filter(row => row.roleCode === "developer").map(row => row.name))],
    publishers: [...new Set(projection.companyReferences.filter(row => row.roleCode === "publisher").map(row => row.name))] };
}
export async function getGameSnapshotFacts(input: {
  mediaItemId: number; mediaType: string; sourceProvider: string | null; sourceExternalId: string | null; facts: Record<string, unknown>;
}, executor: DbTransaction | typeof db = db): Promise<Record<string, unknown>> {
  if (input.mediaType !== "game" || (input.sourceProvider !== "igdb" && input.sourceProvider !== "rawg")) return input.facts;
  if (input.facts.gameSnapshotProcessed !== true) return input.facts;
  if (!input.sourceExternalId) throw new Error("PROVIDER_SNAPSHOT_MISSING");
  const descriptor = describeGameSource(input.sourceProvider, input.sourceExternalId);
  const rows = await executor.select({ snapshot: providerSnapshots }).from(providerSnapshotLinks)
    .innerJoin(providerSnapshots, eq(providerSnapshots.id, providerSnapshotLinks.snapshotId))
    .where(and(eq(providerSnapshotLinks.entityType, "media-item"), eq(providerSnapshotLinks.entityId, String(input.mediaItemId)),
      eq(providerSnapshotLinks.purpose, "primary"), eq(providerSnapshots.providerCode, input.sourceProvider),
      eq(providerSnapshots.resourceType, descriptor.resourceType), eq(providerSnapshots.externalId, input.sourceExternalId),
      eq(providerSnapshots.apiMethod, descriptor.apiMethod), eq(providerSnapshots.requestParams, descriptor.requestParams), eq(providerSnapshots.requestKey, snapshotHash(descriptor.requestParams))));
  if (rows.length === 1) {
    const snapshot = rows[0].snapshot;
    if (snapshotHash(snapshot.payload) !== snapshot.payloadHash) throw new Error("PROVIDER_SNAPSHOT_CHANGED");
    return moderationFacts(normalizeGameSnapshot(snapshot));
  }
  throw new Error("PROVIDER_SNAPSHOT_MISSING");
}
export async function isGameSnapshotSupported(id: number) {
  const [row] = await db.select({ mediaType: mediaItems.mediaType, provider: mediaItemMetadata.sourceProvider, externalId: mediaItemMetadata.sourceExternalId }).from(mediaItems)
    .innerJoin(mediaItemMetadata, eq(mediaItemMetadata.mediaItemId, mediaItems.id)).where(eq(mediaItems.id, id));
  return row?.mediaType === "game" && (row.provider === "igdb" || row.provider === "rawg") && Boolean(row.externalId);
}
export async function getGameMigrationComparison(id: number, projection: ReturnType<typeof normalizeGameSnapshot>) {
  const [metadata] = await db.select({ facts: mediaMetadataFactsSql(), storedFacts: mediaItemMetadata.facts }).from(mediaItems)
    .innerJoin(mediaItemMetadata, eq(mediaItemMetadata.mediaItemId, mediaItems.id)).where(eq(mediaItems.id, id));
  const current = metadata?.facts ?? {};
  const proposed = moderationFacts(projection);
  if (projection.provider !== "igdb" && projection.provider !== "rawg") throw new Error("INVALID_PROVIDER_SNAPSHOT_REFERENCES");
  const { compareGameSnapshotState } = await import("@/db/queries/game-snapshot-transfer");
  const { getGameSnapshotPreview } = await import("@/db/queries/game-snapshot-preview");
  return { id, current, proposed, legacyKeys: Object.keys(current).filter(key => (GAME_LEGACY_FACT_KEYS as readonly string[]).includes(key)),
    preview: await getGameSnapshotPreview(id, projection),
    blockers: await compareGameSnapshotState(db, id, projection.provider, projection.externalId, metadata?.storedFacts ?? {}, projection) };
}
