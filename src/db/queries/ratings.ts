import { and, desc, eq, sql } from "drizzle-orm";

import { db } from "@/db";
import { mediaItems, ratings } from "@/db/schema";

export async function upsertAuthorRating(input: {
  mediaItemId: number;
  authorId: number;
  score: number;
}) {
  const now = new Date();

  await db
    .insert(ratings)
    .values({
      mediaItemId: input.mediaItemId,
      authorId: input.authorId,
      score: input.score,
      createdAt: now,
      updatedAt: now,
    })
    .onConflictDoUpdate({
      target: [ratings.mediaItemId, ratings.authorId],
      set: {
        score: input.score,
        updatedAt: now,
      },
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

export async function getAuthorRatingSummary(authorId: number) {
  const [totalRows, distribution, latestRatings] = await Promise.all([
    db
      .select({
        ratingsCount: sql<number>`count(${ratings.id})::int`,
        averageScore: sql<number | null>`avg(${ratings.score})::float`,
      })
      .from(ratings)
      .where(eq(ratings.authorId, authorId)),
    db
      .select({
        mediaType: mediaItems.mediaType,
        ratingsCount: sql<number>`count(${ratings.id})::int`,
      })
      .from(ratings)
      .innerJoin(mediaItems, eq(mediaItems.id, ratings.mediaItemId))
      .where(eq(ratings.authorId, authorId))
      .groupBy(mediaItems.mediaType),
    db
      .select({
        mediaItemCode: mediaItems.code,
        mediaItemTitle: mediaItems.title,
        score: ratings.score,
        updatedAt: ratings.updatedAt,
      })
      .from(ratings)
      .innerJoin(mediaItems, eq(mediaItems.id, ratings.mediaItemId))
      .where(eq(ratings.authorId, authorId))
      .orderBy(desc(ratings.updatedAt), desc(ratings.id))
      .limit(5),
  ]);
  const totals = totalRows[0];

  return {
    ratingsCount: totals?.ratingsCount ?? 0,
    averageScore: totals?.averageScore ?? null,
    distribution,
    latestRatings,
  };
}
