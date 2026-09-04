import { and, asc, eq, gte, lt, sql } from "drizzle-orm";

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
  mediaTypes,
  ratings,
} from "@/db/schema";
import { PUBLISHED_PUBLICATION_STATUS } from "@/lib/media/publication-status";
import { resolveCoverUrl } from "@/lib/services/minio";
import { parseDailyDossierMinAverageScore } from "@/lib/main-page/daily-dossier-settings";

export type MainPageMediaItem = {
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
  reviewId?: number | null;
  title: string;
};

const globalDailyDossierCondition = and(
  eq(mediaItems.publicationStatus, PUBLISHED_PUBLICATION_STATUS),
  eq(mediaTypes.isPubliclyAvailable, true),
  eq(mediaTypes.isAvailableToGuests, true),
  eq(mediaTypes.enabledByDefault, true),
);

function createDailyDossierQuery(input: {
  afterMediaItemId?: number;
  beforeMediaItemId?: number;
  currentAuthorId?: number;
  mediaItemId?: number;
  minAverageScore: number;
}) {
  const minAverageScore = parseDailyDossierMinAverageScore(input.minAverageScore);

  if (minAverageScore === null) {
    throw new Error("Invalid daily dossier minimum average score");
  }

  return db
    .select({
      averageScore: mediaItemAverageScoreSql,
      code: mediaItems.code,
      coverThumbUrl: mediaItems.coverThumbUrl,
      coverUrl: mediaItems.coverUrl,
      currentAuthorScore: input.currentAuthorId
        ? sql<number | null>`(
            select ${ratings.score} from ${ratings}
            where ${ratings.mediaItemId} = ${mediaItems.id}
              and ${ratings.authorId} = ${input.currentAuthorId}
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
    .innerJoin(mediaTypes, eq(mediaTypes.code, mediaItems.mediaType))
    .leftJoin(mediaCarriers, eq(mediaCarriers.id, mediaItems.mediaCarrierId))
    .leftJoin(mediaItemMetadata, eq(mediaItemMetadata.mediaItemId, mediaItems.id))
    .leftJoin(mediaItemRatingStats, eq(mediaItemRatingStats.mediaItemId, mediaItems.id))
    .where(and(
      globalDailyDossierCondition,
      input.mediaItemId ? eq(mediaItems.id, input.mediaItemId) : undefined,
      input.afterMediaItemId ? gte(mediaItems.id, input.afterMediaItemId) : undefined,
      input.beforeMediaItemId ? lt(mediaItems.id, input.beforeMediaItemId) : undefined,
      minAverageScore > 0
        ? sql`${mediaItemRatingStats.scoreSum} >= ${mediaItemRatingStats.ratingsCount} * ${minAverageScore * 10}`
        : undefined,
    ));
}

function resolveDailyDossierItem(item: MainPageMediaItem | undefined) {
  return item
    ? {
        ...item,
        coverThumbUrl: resolveCoverUrl(item.coverThumbUrl),
        coverUrl: resolveCoverUrl(item.coverUrl),
      }
    : null;
}

export async function getRandomDailyDossierCandidate(input: {
  currentAuthorId?: number;
  minAverageScore: number;
}) {
  const [{ maxId }] = await db.select({ maxId: sql<number | null>`max(${mediaItems.id})::int` }).from(mediaItems);
  if (!maxId) return null;
  const pivot = Math.floor(Math.random() * maxId) + 1;
  const [afterPivot] = await createDailyDossierQuery({ ...input, afterMediaItemId: pivot })
    .orderBy(asc(mediaItems.id))
    .limit(1);
  const item = afterPivot ?? (await createDailyDossierQuery({ ...input, beforeMediaItemId: pivot })
    .orderBy(asc(mediaItems.id))
    .limit(1))[0];

  return resolveDailyDossierItem(item);
}

export async function getEligibleDailyDossierById(
  input: {
    currentAuthorId?: number;
    id: number;
    minAverageScore: number;
  },
) {
  const [item] = await createDailyDossierQuery({
    currentAuthorId: input.currentAuthorId,
    mediaItemId: input.id,
    minAverageScore: input.minAverageScore,
  }).limit(1);

  return resolveDailyDossierItem(item);
}
