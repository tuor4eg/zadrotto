import { eq, inArray, sql } from "drizzle-orm";

import { db } from "@/db";
import {
  mediaItemAverageScoreSql,
  mediaItemRatingsCountSql,
} from "@/db/queries/media-item-rating-stats";
import {
  mediaCarriers,
  mediaItemMetadata,
  mediaItemRatingStats,
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
      averageScore: mediaItemAverageScoreSql,
      code: mediaItems.code,
      coverThumbUrl: mediaItems.coverThumbUrl,
      coverUrl: mediaItems.coverUrl,
      currentAuthorScore: currentAuthorId
        ? sql<number | null>`(
            select ${ratings.score}
            from ${ratings}
            where ${ratings.mediaItemId} = ${mediaItems.id}
              and ${ratings.authorId} = ${currentAuthorId}
            limit 1
          )`
        : sql<number | null>`null`,
      id: mediaItems.id,
      mediaCarrierCode: mediaCarriers.code,
      mediaType: mediaItems.mediaType,
      metadataFacts: mediaItemMetadata.facts,
      ratingsCount: mediaItemRatingsCountSql,
      releaseYear: mediaItems.releaseYear,
      title: mediaItems.title,
    })
    .from(mediaItems)
    .leftJoin(mediaCarriers, eq(mediaCarriers.id, mediaItems.mediaCarrierId))
    .leftJoin(mediaItemMetadata, eq(mediaItemMetadata.mediaItemId, mediaItems.id))
    .leftJoin(mediaItemRatingStats, eq(mediaItemRatingStats.mediaItemId, mediaItems.id))
    .where(inArray(mediaItems.id, uniqueMediaItemIds));

  return rows.map((item) => ({
    ...item,
    coverThumbUrl: resolveCoverUrl(item.coverThumbUrl),
    coverUrl: resolveCoverUrl(item.coverUrl),
  }));
}
