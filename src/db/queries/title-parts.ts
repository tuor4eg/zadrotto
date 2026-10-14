import { rateableRatingSql } from "@/db/queries/effective-ratings";
import { and, eq, sql } from "drizzle-orm";
import { db } from "@/db";
import { resolveCoverUrl } from "@/lib/services/minio";
import { contributions, ratings, titleParts } from "@/db/schema";

export async function getTitlePart(mediaItemId: number, partId: number) {
  const [part] = await db.select().from(titleParts)
    .where(and(eq(titleParts.mediaItemId, mediaItemId), eq(titleParts.id, partId))).limit(1);
  return part ?? null;
}

export async function getTitlePartsForMediaItem(mediaItemId: number, authorId?: number) {
  const aggregated = db.select({
    partId: ratings.partId,
    archiveRating: sql<number>`avg(${ratings.score})::double precision`.as("archive_rating"),
    ratingsCount: sql<number>`count(*)::int`.as("ratings_count"),
    myRating: sql<number | null>`max(${ratings.score}) filter (where ${ratings.authorId} = ${authorId ?? null})`.as("my_rating"),
  }).from(ratings).where(and(eq(ratings.mediaItemId, mediaItemId), rateableRatingSql)).groupBy(ratings.partId).as("part_ratings");
  const rows = await db.select({
    id: titleParts.id, mediaItemId: titleParts.mediaItemId, type: titleParts.type,
    number: titleParts.number, name: titleParts.name, description: titleParts.description, year: titleParts.year,
    episodeCount: titleParts.episodeCount,
    sortOrder: titleParts.sortOrder, coverUrl: titleParts.coverUrl, coverThumbUrl: titleParts.coverThumbUrl,
    myRating: aggregated.myRating, archiveRating: aggregated.archiveRating,
    myReviewId: contributions.id,
    ratingsCount: sql<number>`coalesce(${aggregated.ratingsCount}, 0)::int`,
  }).from(titleParts).leftJoin(aggregated, eq(aggregated.partId, titleParts.id))
    .leftJoin(contributions, and(
      eq(contributions.primaryMediaItemId, titleParts.mediaItemId),
      eq(contributions.partId, titleParts.id),
      eq(contributions.authorId, authorId ?? -1),
      eq(contributions.type, "review"),
      eq(contributions.status, "published"),
    ))
    .where(eq(titleParts.mediaItemId, mediaItemId)).orderBy(titleParts.sortOrder, titleParts.id);
  return rows.map((row) => ({ ...row, coverUrl: resolveCoverUrl(row.coverUrl), coverThumbUrl: resolveCoverUrl(row.coverThumbUrl) }));
}

export type TitlePartView = Awaited<ReturnType<typeof getTitlePartsForMediaItem>>[number];
