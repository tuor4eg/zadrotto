import { snapshotHash } from "@/lib/providers/snapshot-values";
import { and, asc, eq, gt, inArray, lte, notExists, or, sql } from "drizzle-orm";
import { db } from "@/db";
import { mediaItems, mediaItemMetadata, providerSnapshots } from "@/db/schema";
import { SNAPSHOT_DEFAULT_BATCH_SIZE } from "@/lib/providers/snapshot-job-payload";
import type { BookProviderCode } from "@/lib/providers/types";

/** Exact primary request; deliberately never reads payload or snapshot links. */
function missingPrimarySnapshot() {
  return notExists(db.select({id:providerSnapshots.id}).from(providerSnapshots).where(and(
    eq(providerSnapshots.providerCode,mediaItemMetadata.sourceProvider),
    eq(providerSnapshots.externalId,mediaItemMetadata.sourceExternalId),
    eq(providerSnapshots.resourceType,sql`case ${mediaItemMetadata.sourceProvider} when 'google-books' then 'volume' when 'tmdb' then case when ${mediaItems.mediaType}='series' then 'tv' else 'movie' end else 'work' end`),
    eq(providerSnapshots.apiMethod,sql`case ${mediaItemMetadata.sourceProvider} when 'fantlab' then 'search-ids' when 'google-books' then 'volumes.get' when 'tmdb' then case when ${mediaItems.mediaType}='series' then 'tv.details' else 'movie.details' end else 'works.get' end`),
    eq(providerSnapshots.requestParams,sql`case ${mediaItemMetadata.sourceProvider}
      when 'fantlab' then jsonb_build_object('w',${mediaItemMetadata.sourceExternalId})
      when 'tmdb' then case when ${mediaItems.mediaType}='series' then '{"language":"ru-RU","append_to_response":"aggregate_credits"}'::jsonb else '{"language":"ru-RU","append_to_response":"credits"}'::jsonb end else '{}'::jsonb end`),
  )));
}

/** One extra row determines whether another batch exists, without a separate count. */
export function providerSnapshotBookBatchQuery(input:{mediaType?:"book"|"film"|"series";afterId:number;throughId:number;provider?:BookProviderCode | "tmdb";mediaItemIds?:number[];batchSize?:number;onlyMissingSnapshots?:boolean;retryId?:number}) {
  return db.select({id:mediaItems.id,mediaType:mediaItems.mediaType,provider:mediaItemMetadata.sourceProvider,externalId:mediaItemMetadata.sourceExternalId})
    .from(mediaItemMetadata).innerJoin(mediaItems,eq(mediaItems.id,mediaItemMetadata.mediaItemId))
    .where(and(input.mediaType ? eq(mediaItems.mediaType,input.mediaType) : input.provider === "tmdb" ? eq(mediaItems.mediaType,"film") : input.provider ? eq(mediaItems.mediaType,"book") : or(and(eq(mediaItems.mediaType,"book"),inArray(mediaItemMetadata.sourceProvider,["fantlab","google-books","open-library"])),and(eq(mediaItems.mediaType,"film"),eq(mediaItemMetadata.sourceProvider,"tmdb"))),gt(mediaItemMetadata.mediaItemId,input.afterId),lte(mediaItemMetadata.mediaItemId,input.throughId),
      gt(mediaItems.id,input.afterId),lte(mediaItems.id,input.throughId),
      input.provider?eq(mediaItemMetadata.sourceProvider,input.provider):inArray(mediaItemMetadata.sourceProvider,input.mediaType === "series" || input.mediaType === "film" ? ["tmdb"] : input.mediaType === "book" ? ["fantlab","google-books","open-library"] : ["fantlab","google-books","open-library","tmdb"]),
      input.mediaItemIds?inArray(mediaItemMetadata.mediaItemId,input.mediaItemIds):undefined,
      input.onlyMissingSnapshots ? (input.retryId ? or(missingPrimarySnapshot(),eq(mediaItemMetadata.mediaItemId,input.retryId)) : missingPrimarySnapshot()) : undefined))
    .orderBy(asc(mediaItemMetadata.mediaItemId)).limit((input.batchSize ?? SNAPSHOT_DEFAULT_BATCH_SIZE) + 1);
}

/** Supplemental AniList evidence covers both AniList and exact MAL-backed Jikan sources. */
export function providerSnapshotAnimeBatchQuery(input: { afterId: number; throughId: number; mediaItemIds?: number[]; batchSize?: number; onlyMissingSnapshots?: boolean; retryId?: number }) {
  const missing = notExists(db.select({ id: providerSnapshots.id }).from(providerSnapshots).where(and(
    eq(providerSnapshots.providerCode, "anilist"), eq(providerSnapshots.resourceType, "anime"), eq(providerSnapshots.apiMethod, "anime.creators"),
    eq(providerSnapshots.requestParams, sql`'{"version":1}'::jsonb`), eq(providerSnapshots.requestKey, snapshotHash({ version: 1 })),
    or(and(eq(mediaItemMetadata.sourceProvider, "anilist"), eq(providerSnapshots.externalId, mediaItemMetadata.sourceExternalId)),
      and(eq(mediaItemMetadata.sourceProvider, "jikan"), sql`${providerSnapshots.payload}->>'idMal'=${mediaItemMetadata.sourceExternalId}`)),
  )));
  return db.select({ id: mediaItems.id, mediaType: mediaItems.mediaType, provider: mediaItemMetadata.sourceProvider, externalId: mediaItemMetadata.sourceExternalId })
    .from(mediaItemMetadata).innerJoin(mediaItems, eq(mediaItems.id, mediaItemMetadata.mediaItemId))
    .where(and(eq(mediaItems.mediaType, "anime"), inArray(mediaItemMetadata.sourceProvider, ["anilist", "jikan"]),
      sql`${mediaItemMetadata.sourceExternalId} ~ '^[1-9][0-9]*$'`, gt(mediaItemMetadata.mediaItemId, input.afterId), lte(mediaItemMetadata.mediaItemId, input.throughId),
      input.mediaItemIds ? inArray(mediaItemMetadata.mediaItemId, input.mediaItemIds) : undefined,
      input.onlyMissingSnapshots ? input.retryId ? or(missing, eq(mediaItemMetadata.mediaItemId, input.retryId)) : missing : undefined))
    .orderBy(asc(mediaItemMetadata.mediaItemId)).limit((input.batchSize ?? SNAPSHOT_DEFAULT_BATCH_SIZE) + 1);
}
