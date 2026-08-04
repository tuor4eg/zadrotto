import { eq, inArray, sql } from "drizzle-orm";

import { db } from "@/db";
import {
  mediaCarriers,
  mediaItemMetadata,
  mediaItems,
  ratings,
} from "@/db/schema";
import { resolveCoverUrl } from "@/lib/services/minio";

export type MediaItemTileData = {
  averageScore: number | null;
  code: string;
  coverThumbUrl: string | null;
  coverUrl: string | null;
  currentAuthorScore: number | null;
  id: number;
  mediaCarrierCode: string | null;
  mediaType: string;
  metadataFacts: Record<string, unknown> | null;
  ratingsCount: number;
  releaseYear: number | null;
  title: string;
};

export async function getMediaItemTilesByIds(
  mediaItemIds: readonly number[],
  currentAuthorId?: number,
): Promise<MediaItemTileData[]> {
  const uniqueMediaItemIds = [...new Set(mediaItemIds)];

  if (uniqueMediaItemIds.length === 0) {
    return [];
  }

  const rows = await db
    .select({
      averageScore: sql<number | null>`avg(${ratings.score})::float`,
      code: mediaItems.code,
      coverThumbUrl: mediaItems.coverThumbUrl,
      coverUrl: mediaItems.coverUrl,
      currentAuthorScore: currentAuthorId
        ? sql<number | null>`max(${ratings.score}) filter (where ${ratings.authorId} = ${currentAuthorId})::int`
        : sql<number | null>`null`,
      id: mediaItems.id,
      mediaCarrierCode: mediaCarriers.code,
      mediaType: mediaItems.mediaType,
      metadataFacts: mediaItemMetadata.facts,
      ratingsCount: sql<number>`count(distinct ${ratings.id})::int`,
      releaseYear: mediaItems.releaseYear,
      title: mediaItems.title,
    })
    .from(mediaItems)
    .leftJoin(mediaCarriers, eq(mediaCarriers.id, mediaItems.mediaCarrierId))
    .leftJoin(mediaItemMetadata, eq(mediaItemMetadata.mediaItemId, mediaItems.id))
    .leftJoin(ratings, eq(ratings.mediaItemId, mediaItems.id))
    .where(inArray(mediaItems.id, uniqueMediaItemIds))
    .groupBy(mediaItems.id, mediaCarriers.code, mediaItemMetadata.facts);

  return rows.map((item) => ({
    ...item,
    coverThumbUrl: resolveCoverUrl(item.coverThumbUrl),
    coverUrl: resolveCoverUrl(item.coverUrl),
  }));
}
