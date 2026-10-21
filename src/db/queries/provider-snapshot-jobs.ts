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
    eq(providerSnapshots.resourceType,sql`case ${mediaItemMetadata.sourceProvider} when 'google-books' then 'volume' when 'tmdb' then 'movie' else 'work' end`),
    eq(providerSnapshots.apiMethod,sql`case ${mediaItemMetadata.sourceProvider} when 'fantlab' then 'search-ids' when 'google-books' then 'volumes.get' when 'tmdb' then 'movie.details' else 'works.get' end`),
    eq(providerSnapshots.requestParams,sql`case ${mediaItemMetadata.sourceProvider}
      when 'fantlab' then jsonb_build_object('w',${mediaItemMetadata.sourceExternalId})
      when 'tmdb' then '{"language":"ru-RU","append_to_response":"credits"}'::jsonb else '{}'::jsonb end`),
  )));
}

/** One extra row determines whether another batch exists, without a separate count. */
export function providerSnapshotBookBatchQuery(input:{afterId:number;throughId:number;provider?:BookProviderCode | "tmdb";mediaItemIds?:number[];batchSize?:number;onlyMissingSnapshots?:boolean;retryId?:number}) {
  return db.select({id:mediaItems.id,provider:mediaItemMetadata.sourceProvider,externalId:mediaItemMetadata.sourceExternalId})
    .from(mediaItemMetadata).innerJoin(mediaItems,eq(mediaItems.id,mediaItemMetadata.mediaItemId))
    .where(and(eq(mediaItems.mediaType,input.provider === "tmdb" ? "film" : "book"),gt(mediaItemMetadata.mediaItemId,input.afterId),lte(mediaItemMetadata.mediaItemId,input.throughId),
      gt(mediaItems.id,input.afterId),lte(mediaItems.id,input.throughId),
      input.provider?eq(mediaItemMetadata.sourceProvider,input.provider):inArray(mediaItemMetadata.sourceProvider,["fantlab","google-books","open-library"]),
      input.mediaItemIds?inArray(mediaItemMetadata.mediaItemId,input.mediaItemIds):undefined,
      input.onlyMissingSnapshots ? (input.retryId ? or(missingPrimarySnapshot(),eq(mediaItemMetadata.mediaItemId,input.retryId)) : missingPrimarySnapshot()) : undefined))
    .orderBy(asc(mediaItemMetadata.mediaItemId)).limit((input.batchSize ?? SNAPSHOT_DEFAULT_BATCH_SIZE) + 1);
}
