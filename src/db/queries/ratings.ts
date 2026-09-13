import { and, asc, desc, eq, isNotNull, sql } from "drizzle-orm";

import { db } from "@/db";
import { getMediaTypeCodeFilterSql } from "@/db/queries/media-types";
import { authorMediaStatuses, mediaItems, ratings } from "@/db/schema";
import { lockAuthorMediaState } from "@/db/queries/author-media-statuses";
import { runInDomainEventTransaction } from "@/db/transaction";

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

  await runInDomainEventTransaction(async (tx, appendEvent) => {
    await lockAuthorMediaState(tx, input);
    const [existingRating] = await tx
      .select({ id: ratings.id })
      .from(ratings)
      .where(and(
        eq(ratings.mediaItemId, input.mediaItemId),
        eq(ratings.authorId, input.authorId),
      ))
      .limit(1);
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

    if (!existingRating) {
      await appendEvent({
        actorAuthorId: input.authorId,
        aggregateId: `${input.authorId}:${input.mediaItemId}`,
        aggregateType: "rating",
        payload: { authorId: input.authorId, mediaItemId: input.mediaItemId },
        type: "rating.created",
      });
    }
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

export async function getAuthorRatingsCount(authorId: number) {
  const [row] = await db
    .select({
      ratingsCount: sql<number>`count(${ratings.id})::int`,
    })
    .from(ratings)
    .where(eq(ratings.authorId, authorId));

  return row?.ratingsCount ?? 0;
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
  const [totalRows, distribution, releaseYearDistribution, scoreMediaTypeDistribution, latestRatings] = await Promise.all([
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
        year: mediaItems.releaseYear,
        mediaType: mediaItems.mediaType,
        ratingsCount: sql<number>`count(${ratings.id})::int`,
      })
      .from(ratings)
      .innerJoin(mediaItems, eq(mediaItems.id, ratings.mediaItemId))
      .where(and(
        eq(ratings.authorId, authorId),
        getMediaTypeCodeFilterSql(mediaItems.mediaType, enabledMediaTypeCodes),
        isNotNull(mediaItems.releaseYear),
      ))
      .groupBy(mediaItems.releaseYear, mediaItems.mediaType)
      .orderBy(asc(mediaItems.releaseYear)),
    db
      .select({
        score: ratings.score,
        mediaType: mediaItems.mediaType,
        ratingsCount: sql<number>`count(${ratings.id})::int`,
      })
      .from(ratings)
      .innerJoin(mediaItems, eq(mediaItems.id, ratings.mediaItemId))
      .where(and(
        eq(ratings.authorId, authorId),
        getMediaTypeCodeFilterSql(mediaItems.mediaType, enabledMediaTypeCodes),
      ))
      .groupBy(ratings.score, mediaItems.mediaType),
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
  const releaseYearTotals = new Map<number, number>();
  const scoreTotals = new Map<number, number>();
  for (const item of scoreMediaTypeDistribution) {
    scoreTotals.set(item.score, (scoreTotals.get(item.score) ?? 0) + item.ratingsCount);
  }
  const releaseYearMediaTypeDistribution = releaseYearDistribution.flatMap((item) => {
    if (item.year === null) return [];

    releaseYearTotals.set(item.year, (releaseYearTotals.get(item.year) ?? 0) + item.ratingsCount);
    return [{
      count: item.ratingsCount,
      mediaType: item.mediaType,
      year: item.year,
    }];
  });

  return {
    ratingsCount: totals?.ratingsCount ?? 0,
    averageScore: totals?.averageScore ?? null,
    currentYearRatingsCount: totals?.currentYearRatingsCount ?? 0,
    distribution,
    releaseYearDistribution: [...releaseYearTotals].map(([year, count]) => ({ count, year })),
    releaseYearMediaTypeDistribution,
    scoreDistribution: [...scoreTotals].map(([score, ratingsCount]) => ({ ratingsCount, score })),
    scoreMediaTypeDistribution,
    latestRatings,
  };
}
