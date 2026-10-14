import { and, asc, desc, eq, isNull, isNotNull, sql } from "drizzle-orm";

import { effectiveRatingColumns, getEffectiveRatingsQuery, rateableRatingSql } from "@/db/queries/effective-ratings";
import { db } from "@/db";
import { getMediaTypeCodeFilterSql } from "@/db/queries/media-types";
import { authorMediaStatuses, mediaItems, ratings, titleParts } from "@/db/schema";
import { lockAuthorMediaState } from "@/db/queries/author-media-statuses";
import { runInDomainEventTransaction } from "@/db/transaction";
import { getTitlePartLabel } from "@/lib/media/title-parts";
import { PUBLISHED_PUBLICATION_STATUS } from "@/lib/media/publication-status";

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
  partId?: number | null;
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
        input.partId == null ? isNull(ratings.partId) : eq(ratings.partId, input.partId),
      ))
      .limit(1);
    await tx
      .delete(authorMediaStatuses)
      .where(and(eq(authorMediaStatuses.mediaItemId, input.mediaItemId), eq(authorMediaStatuses.authorId, input.authorId)));
    await tx
      .insert(ratings)
      .values({ ...input, createdAt: now, updatedAt: now })
      .onConflictDoUpdate({
        target: input.partId == null
          ? [ratings.mediaItemId, ratings.authorId]
          : [ratings.mediaItemId, ratings.authorId, ratings.partId],
        targetWhere: input.partId == null ? sql`${ratings.partId} is null` : sql`${ratings.partId} is not null`,
        set: { score: input.score, updatedAt: now },
      });

    if (!existingRating) {
      await appendEvent({
        actorAuthorId: input.authorId,
        aggregateId: `${input.authorId}:${input.mediaItemId}${input.partId == null ? "" : `:part:${input.partId}`}`,
        aggregateType: "rating",
        payload: { authorId: input.authorId, mediaItemId: input.mediaItemId, ...(input.partId == null ? {} : { partId: input.partId }) },
        type: "rating.created",
      });
    }
  });
}

export async function getAuthorRating(mediaItemId: number, authorId: number, partId: number | null = null) {
  const [rating] = await db
    .select({
      score: ratings.score,
    })
    .from(ratings)
    .where(and(eq(ratings.mediaItemId, mediaItemId), eq(ratings.authorId, authorId), partId == null ? isNull(ratings.partId) : eq(ratings.partId, partId)))
    .limit(1);

  return rating ?? null;
}

export async function getAuthorRatingsCount(authorId: number) {
  const [row] = await db
    .select({
      ratingsCount: sql<number>`count(distinct ${ratings.mediaItemId})::int`,
    })
    .from(ratings)
    .where(and(eq(ratings.authorId, authorId), rateableRatingSql));

  return row?.ratingsCount ?? 0;
}

export async function deleteAuthorRating(input: {
  mediaItemId: number;
  authorId: number;
  partId?: number | null;
}) {
  await db.transaction(async (tx) => {
    await lockAuthorMediaState(tx, input);
    await tx.delete(ratings).where(and(eq(ratings.mediaItemId, input.mediaItemId), eq(ratings.authorId, input.authorId),
      input.partId == null ? isNull(ratings.partId) : eq(ratings.partId, input.partId)));
  });
}

export async function getAuthorRatingSummary(
  authorId: number,
  enabledMediaTypeCodes: readonly string[],
) {
  const effectiveRatings = getEffectiveRatingsQuery();
  const currentYear = getCurrentMoscowYear();
  const [totalRows, distribution, releaseYearDistribution, scoreMediaTypeDistribution, latestRatings] = await Promise.all([
    db
      .select({
        ratingsCount: sql<number>`count(${effectiveRatingColumns.id})::int`,
        averageScore: sql<number | null>`avg(${effectiveRatingColumns.score})::float`,
        currentYearRatingsCount:
          sql<number>`count(${effectiveRatingColumns.id}) filter (where extract(year from ${effectiveRatingColumns.createdAt} at time zone 'Europe/Moscow') = ${currentYear})::int`,
      })
      .from(effectiveRatings)
      .innerJoin(mediaItems, eq(mediaItems.id, effectiveRatings.mediaItemId))
      .where(and(
        eq(effectiveRatings.authorId, authorId),
        getMediaTypeCodeFilterSql(mediaItems.mediaType, enabledMediaTypeCodes),
      )),
    db
      .select({
        mediaType: mediaItems.mediaType,
        ratingsCount: sql<number>`count(${effectiveRatingColumns.id})::int`,
      })
      .from(effectiveRatings)
      .innerJoin(mediaItems, eq(mediaItems.id, effectiveRatings.mediaItemId))
      .where(and(
        eq(effectiveRatings.authorId, authorId),
        getMediaTypeCodeFilterSql(mediaItems.mediaType, enabledMediaTypeCodes),
      ))
      .groupBy(mediaItems.mediaType),
    db
      .select({
        year: mediaItems.releaseYear,
        mediaType: mediaItems.mediaType,
        ratingsCount: sql<number>`count(${effectiveRatingColumns.id})::int`,
      })
      .from(effectiveRatings)
      .innerJoin(mediaItems, eq(mediaItems.id, effectiveRatings.mediaItemId))
      .where(and(
        eq(effectiveRatings.authorId, authorId),
        getMediaTypeCodeFilterSql(mediaItems.mediaType, enabledMediaTypeCodes),
        isNotNull(mediaItems.releaseYear),
      ))
      .groupBy(mediaItems.releaseYear, mediaItems.mediaType)
      .orderBy(asc(mediaItems.releaseYear)),
    db
      .select({
        score: effectiveRatingColumns.distributionScore,
        mediaType: mediaItems.mediaType,
        ratingsCount: sql<number>`count(${effectiveRatingColumns.id})::int`,
      })
      .from(effectiveRatings)
      .innerJoin(mediaItems, eq(mediaItems.id, effectiveRatings.mediaItemId))
      .where(and(
        eq(effectiveRatings.authorId, authorId),
        getMediaTypeCodeFilterSql(mediaItems.mediaType, enabledMediaTypeCodes),
      ))
      .groupBy(effectiveRatingColumns.distributionScore, mediaItems.mediaType),
    db
      .select({
        id: ratings.id,
        partId: ratings.partId,
        partType: titleParts.type,
        partNumber: titleParts.number,
        partName: titleParts.name,
        mediaItemId: mediaItems.id,
        mediaItemCode: mediaItems.code,
        mediaItemTitle: mediaItems.title,
        score: ratings.score,
        updatedAt: ratings.updatedAt,
      })
      .from(ratings)
      .leftJoin(titleParts, eq(titleParts.id, ratings.partId))
      .innerJoin(mediaItems, eq(mediaItems.id, ratings.mediaItemId))
      .where(and(
        eq(ratings.authorId, authorId),
        rateableRatingSql,
        eq(mediaItems.publicationStatus, PUBLISHED_PUBLICATION_STATUS),
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
    latestRatings: latestRatings.map(({ partType, partNumber, partName, ...rating }) => ({
      ...rating,
      partLabel: partType !== null && partNumber !== null ? getTitlePartLabel({ type: partType, number: partNumber, name: partName }) : null,
    })),
  };
}
