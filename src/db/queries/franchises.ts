import { asc, eq, sql } from "drizzle-orm";

import { db } from "@/db";
import { franchises, mediaItems, ratings } from "@/db/schema";

export async function getFranchiseByCode(code: string) {
  const [franchise] = await db
    .select({
      id: franchises.id,
      code: franchises.code,
      title: franchises.title,
      originalTitle: franchises.originalTitle,
      description: franchises.description,
    })
    .from(franchises)
    .where(eq(franchises.code, code))
    .limit(1);

  return franchise ?? null;
}

export async function getMediaItemsByFranchiseId(franchiseId: number) {
  return db
    .select({
      id: mediaItems.id,
      code: mediaItems.code,
      title: mediaItems.title,
      originalTitle: mediaItems.originalTitle,
      description: mediaItems.description,
      mediaType: mediaItems.mediaType,
      releaseYear: mediaItems.releaseYear,
      averageScore: sql<number | null>`avg(${ratings.score})::float`,
      ratingsCount: sql<number>`count(${ratings.id})::int`,
    })
    .from(mediaItems)
    .leftJoin(ratings, eq(ratings.mediaItemId, mediaItems.id))
    .where(eq(mediaItems.franchiseId, franchiseId))
    .groupBy(
      mediaItems.id,
      mediaItems.code,
      mediaItems.title,
      mediaItems.originalTitle,
      mediaItems.description,
      mediaItems.mediaType,
      mediaItems.releaseYear,
    )
    .orderBy(sql`${mediaItems.releaseYear} asc nulls last`, asc(mediaItems.title));
}

export type FranchiseMediaItem = Awaited<
  ReturnType<typeof getMediaItemsByFranchiseId>
>[number];
