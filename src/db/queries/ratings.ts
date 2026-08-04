import { and, desc, eq, sql } from "drizzle-orm";

import { db } from "@/db";
import { getMediaTypeCodeFilterSql } from "@/db/queries/media-types";
import { authorMediaStatuses, mediaItems, ratings } from "@/db/schema";
import { lockAuthorMediaState } from "@/db/queries/author-media-statuses";

function getCurrentMoscowYear() {
  return Number(
    new Intl.DateTimeFormat("ru-RU", {
      timeZone: "Europe/Moscow",
      year: "numeric",
    }).format(new Date()),
  );
}

export async function upsertAuthorRating(input: {
  mediaItemId: number;
  authorId: number;
  score: number;
}) {
  const now = new Date();

  await db.transaction(async (tx) => {
    await lockAuthorMediaState(tx, input);
    await tx
      .delete(authorMediaStatuses)
      .where(and(eq(authorMediaStatuses.mediaItemId, input.mediaItemId), eq(authorMediaStatuses.authorId, input.authorId)));
    await tx
      .insert(ratings)
      .values({ ...input, createdAt: now, updatedAt: now })
      .onConflictDoUpdate({
        target: [ratings.mediaItemId, ratings.authorId],
        set: { score: input.score, updatedAt: now },
      });
  });
}

export async function getAuthorRating(mediaItemId: number, authorId: number) {
  const [rating] = await db
    .select({
      score: ratings.score,
    })
    .from(ratings)
    .where(and(eq(ratings.mediaItemId, mediaItemId), eq(ratings.authorId, authorId)))
    .limit(1);

  return rating ?? null;
}

export async function deleteAuthorRating(input: {
  mediaItemId: number;
  authorId: number;
}) {
  await db
    .delete(ratings)
    .where(and(eq(ratings.mediaItemId, input.mediaItemId), eq(ratings.authorId, input.authorId)));
}

export async function getAuthorRatingSummary(
  authorId: number,
  enabledMediaTypeCodes: readonly string[],
) {
  const currentYear = getCurrentMoscowYear();
  const [totalRows, distribution, scoreDistribution, latestRatings] = await Promise.all([
    db
      .select({
        ratingsCount: sql<number>`count(${ratings.id})::int`,
        averageScore: sql<number | null>`avg(${ratings.score})::float`,
        currentYearRatingsCount:
          sql<number>`count(${ratings.id}) filter (where extract(year from ${ratings.createdAt} at time zone 'Europe/Moscow') = ${currentYear})::int`,
      })
      .from(ratings)
      .innerJoin(mediaItems, eq(mediaItems.id, ratings.mediaItemId))
      .where(and(
        eq(ratings.authorId, authorId),
        getMediaTypeCodeFilterSql(mediaItems.mediaType, enabledMediaTypeCodes),
      )),
    db
      .select({
        mediaType: mediaItems.mediaType,
        ratingsCount: sql<number>`count(${ratings.id})::int`,
      })
      .from(ratings)
      .innerJoin(mediaItems, eq(mediaItems.id, ratings.mediaItemId))
      .where(and(
        eq(ratings.authorId, authorId),
        getMediaTypeCodeFilterSql(mediaItems.mediaType, enabledMediaTypeCodes),
      ))
      .groupBy(mediaItems.mediaType),
    db
      .select({
        score: ratings.score,
        ratingsCount: sql<number>`count(${ratings.id})::int`,
      })
      .from(ratings)
      .innerJoin(mediaItems, eq(mediaItems.id, ratings.mediaItemId))
      .where(and(
        eq(ratings.authorId, authorId),
        getMediaTypeCodeFilterSql(mediaItems.mediaType, enabledMediaTypeCodes),
      ))
      .groupBy(ratings.score),
    db
      .select({
        mediaItemId: mediaItems.id,
        mediaItemCode: mediaItems.code,
        mediaItemTitle: mediaItems.title,
        score: ratings.score,
        updatedAt: ratings.updatedAt,
      })
      .from(ratings)
      .innerJoin(mediaItems, eq(mediaItems.id, ratings.mediaItemId))
      .where(and(
        eq(ratings.authorId, authorId),
        getMediaTypeCodeFilterSql(mediaItems.mediaType, enabledMediaTypeCodes),
      ))
      .orderBy(desc(ratings.updatedAt), desc(ratings.id))
      .limit(5),
  ]);
  const totals = totalRows[0];

  return {
    ratingsCount: totals?.ratingsCount ?? 0,
    averageScore: totals?.averageScore ?? null,
    currentYearRatingsCount: totals?.currentYearRatingsCount ?? 0,
    distribution,
    scoreDistribution,
    latestRatings,
  };
}
