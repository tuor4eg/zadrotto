import { eq, inArray, sql } from "drizzle-orm";

import { db } from "@/db";
import { hasUnifiedGenresSql, publicMediaItemGenresJsonSql } from "@/db/queries/media-item-genres";
import type { MediaItemGenre } from "@/lib/media/genres";
import {
  mediaItemAverageScoreSql,
  mediaItemRatingsCountSql,
} from "@/db/queries/media-item-rating-stats";
import {
  mediaCarriers,
  mediaItemMetadata,
  mediaItemRatingStats,
  mediaItems,
  mediaTypes,
  ratings,
  authorMediaExperiences,
} from "@/db/schema";
import type { FirstExperiencedPrecision } from "@/lib/authors/media-experiences";
import { resolveCoverUrl } from "@/lib/services/minio";

export type MediaItemTileData = {
  averageScore: number | null;
  code: string;
  coverThumbUrl: string | null;
  coverUrl: string | null;
  currentAuthorScore: number | null;
  currentAuthorFirstExperiencedAt?: string | null;
  currentAuthorFirstExperiencedPrecision?: FirstExperiencedPrecision | null;
  id: number;
  mediaCarrierCode: string | null;
  mediaType: string;
  mediaTypeName: string;
  metadataFacts: Record<string, unknown> | null;
  genres: MediaItemGenre[];
  hasUnifiedGenres: boolean;
  originalTitle: string | null;
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
      currentAuthorFirstExperiencedAt: currentAuthorId
        ? sql<string | null>`(select ${authorMediaExperiences.firstExperiencedAt} from ${authorMediaExperiences} where ${authorMediaExperiences.mediaItemId} = ${mediaItems.id} and ${authorMediaExperiences.authorId} = ${currentAuthorId} limit 1)`
        : sql<string | null>`null`,
      currentAuthorFirstExperiencedPrecision: currentAuthorId
        ? sql<FirstExperiencedPrecision | null>`(select ${authorMediaExperiences.firstExperiencedPrecision} from ${authorMediaExperiences} where ${authorMediaExperiences.mediaItemId} = ${mediaItems.id} and ${authorMediaExperiences.authorId} = ${currentAuthorId} limit 1)`
        : sql<FirstExperiencedPrecision | null>`null`,
      mediaCarrierCode: mediaCarriers.code,
      mediaType: mediaItems.mediaType,
      mediaTypeName: mediaTypes.name,
      metadataFacts: mediaItemMetadata.facts,
      genres: publicMediaItemGenresJsonSql(),
      hasUnifiedGenres: hasUnifiedGenresSql(),
      originalTitle: mediaItems.originalTitle,
      ratingsCount: mediaItemRatingsCountSql,
      releaseYear: mediaItems.releaseYear,
      title: mediaItems.title,
    })
    .from(mediaItems)
    .innerJoin(mediaTypes, eq(mediaTypes.code, mediaItems.mediaType))
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
