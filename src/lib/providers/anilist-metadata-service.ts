import "server-only";
import { eq, inArray } from "drizzle-orm";
import { db } from "@/db";
import type { DbTransaction } from "@/db/transaction";
import { mediaItemMetadata, providerSnapshots } from "@/db/schema";
import { getProviderSnapshot, providerRequestStartedAt, saveProviderSnapshot } from "@/db/queries/provider-snapshots";
import { fetchAniList, aniListRetryAfterSeconds } from "@/lib/covers/anilist-request";
import type { MediaTitleMetadata, TitleMetadataInput, TitleMetadataOptions } from "@/lib/covers/types";
import { boundedJson, SnapshotProviderHttpError } from "./book-fetch";
import { ANILIST_MEDIA_FIELDS, ANILIST_METADATA_FACT_KEYS, describeAniListMetadata, normalizeAniListMetadata } from "./anilist-metadata-adapter";
import { snapshotHash, validateSnapshotReferences, type SnapshotReference } from "./snapshot-values";
import { prepareAniListCreatorSnapshot } from "./anilist-creators-service";

/** Accept old creator-only selections during rollout, while rejecting unrelated evidence. */
export async function prepareAniListSnapshotBundle(provider: string, externalId: string, refs: SnapshotReference[], executor: DbTransaction | typeof db = db) {
  if (!validateSnapshotReferences(refs)) throw new Error("INVALID_PROVIDER_SNAPSHOT_REFERENCES");
  const rows = await executor.select({ id: providerSnapshots.id, method: providerSnapshots.apiMethod }).from(providerSnapshots).where(inArray(providerSnapshots.id, refs.map(ref => ref.id)));
  if (rows.length !== refs.length || rows.some(row => !["anime.details", "anime.creators"].includes(row.method))) throw new Error("INVALID_PROVIDER_SNAPSHOT_REFERENCES");
  const details = refs.filter(ref => rows.find(row => row.id === ref.id)?.method === "anime.details");
  const creators = refs.filter(ref => rows.find(row => row.id === ref.id)?.method === "anime.creators");
  if (details.length && provider !== "anilist") throw new Error("INVALID_PROVIDER_SNAPSHOT_TARGET");
  return {
    metadata: details.length ? await prepareAniListMetadataReferences(externalId, details, executor) : null,
    creators: creators.length ? await prepareAniListCreatorSnapshot(provider, externalId, creators, executor) : null,
  };
}

export async function getSavedAniListMetadataBundle(externalId: string) {
  const primary = await getProviderSnapshot(describeAniListMetadata(externalId));
  if (!primary) throw new Error("PROVIDER_SNAPSHOT_MISSING");
  if (snapshotHash(primary.payload) !== primary.payloadHash) throw new Error("PROVIDER_SNAPSHOT_CHANGED");
  return { primary, projection: normalizeAniListMetadata(primary) };
}

export async function prepareAniListMetadataReferences(externalId: string, refs: SnapshotReference[], executor: DbTransaction | typeof db = db) {
  if (!validateSnapshotReferences(refs) || refs.length !== 1) throw new Error("INVALID_PROVIDER_SNAPSHOT_REFERENCES");
  const descriptor = describeAniListMetadata(externalId);
  const [primary] = await executor.select().from(providerSnapshots).where(eq(providerSnapshots.id, refs[0].id));
  if (!primary || primary.payloadHash !== refs[0].payloadHash || snapshotHash(primary.payload) !== primary.payloadHash) throw new Error("PROVIDER_SNAPSHOT_CHANGED");
  if (primary.providerCode !== descriptor.providerCode || primary.resourceType !== descriptor.resourceType || primary.externalId !== externalId
    || primary.apiMethod !== descriptor.apiMethod || primary.requestKey !== snapshotHash(descriptor.requestParams)
    || snapshotHash(primary.requestParams) !== snapshotHash(descriptor.requestParams)) throw new Error("INVALID_PROVIDER_SNAPSHOT_REFERENCES");
  return { primary, projection: normalizeAniListMetadata(primary) };
}

export async function fetchAniListMetadata(input: TitleMetadataInput, options: TitleMetadataOptions): Promise<MediaTitleMetadata> {
  if (input.provider !== "anilist" || input.mediaType !== "anime") throw new Error("INVALID_PROVIDER_SNAPSHOT_TARGET");
  const descriptor = describeAniListMetadata(input.externalId);
  const reuseAfter = input.reuseSavedSnapshot ? new Date(0) : options.snapshotReuseAfter;
  let primary = reuseAfter ? await getProviderSnapshot(descriptor) : null;
  if (!primary || primary.fetchedAt < reuseAfter!) {
    const requestStartedAt = await providerRequestStartedAt();
    const response = await fetchAniList("https://graphql.anilist.co", {
      method: "POST", headers: { "content-type": "application/json", accept: "application/json" }, signal: options.signal,
      body: JSON.stringify({ query: `query Anime($id: Int!) { Media(id: $id, type: ANIME) { ${ANILIST_MEDIA_FIELDS} } }`, variables: { id: Number(input.externalId) } }),
    }, { beforeRequest: async () => {
      const allowed = await options.beforeProviderSearch?.("anilist");
      if (allowed === false || typeof allowed === "string") throw new Error(typeof allowed === "string" ? allowed : "provider-daily-limit");
    } });
    if (!response.ok) {
      await response.body?.cancel();
      throw new SnapshotProviderHttpError(response.status, aniListRetryAfterSeconds(response.headers));
    }
    const payload = await boundedJson(response);
    normalizeAniListMetadata({ ...descriptor, payload });
    options.signal?.throwIfAborted();
    primary = await saveProviderSnapshot({ ...descriptor, payload, payloadHash: snapshotHash(payload), contentType: "application/json", requestStartedAt, fetchedAt: new Date() }, options.snapshotJobGuard);
  }
  if (snapshotHash(primary.payload) !== primary.payloadHash) throw new Error("PROVIDER_SNAPSHOT_CHANGED");
  const projection = normalizeAniListMetadata(primary);
  let fields: MediaTitleMetadata["fields"] = projection.fields;
  if (options.enrichTitleFields && projection.idMal) {
    const { getShikimoriAnime } = await import("@/lib/covers/providers/anilist");
    const enrichment = await getShikimoriAnime(projection.idMal);
    if (enrichment.kind === "terminal") fields = { ...fields, ...(enrichment.russian ? { aliases: [enrichment.russian] } : {}), ...(enrichment.description ? { description: enrichment.description } : {}) };
  }
  return { provider: "anilist", externalId: projection.externalId, sourceUrl: projection.sourceUrl,
    facts: projection.facts, genreFacts: projection.genreFacts,
    snapshotReferences: [{ id: primary.id, payloadHash: primary.payloadHash }], ...(options.enrichTitleFields ? { fields } : {}) };
}

export async function getAniListMetadataComparison(mediaItemId: number, projection: ReturnType<typeof normalizeAniListMetadata>) {
  const [row] = await db.select({ facts: mediaItemMetadata.facts }).from(mediaItemMetadata).where(eq(mediaItemMetadata.mediaItemId, mediaItemId));
  const current = Object.fromEntries(ANILIST_METADATA_FACT_KEYS.filter(key => key in (row?.facts ?? {})).map(key => [key, row!.facts[key]]));
  return { current, proposed: projection.facts, blockers: ANILIST_METADATA_FACT_KEYS.filter(key => JSON.stringify(current[key] ?? null) !== JSON.stringify(projection.facts[key] ?? null)).map(key => `facts-difference:${key}`) };
}
