import { and, asc, eq, exists, sql } from "drizzle-orm";

import { db } from "@/db";
import { franchises, mediaItems, ratings } from "@/db/schema";
import { PUBLISHED_PUBLICATION_STATUS } from "@/lib/publication-status";

const publishedMediaItemCondition = eq(
  mediaItems.publicationStatus,
  PUBLISHED_PUBLICATION_STATUS,
);

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
    .where(
      and(
        eq(franchises.code, code),
        exists(
          db
            .select({ id: mediaItems.id })
            .from(mediaItems)
            .where(and(eq(mediaItems.franchiseId, franchises.id), publishedMediaItemCondition)),
        ),
      ),
    )
    .limit(1);

  return franchise ?? null;
}

export async function getFranchiseOptions() {
  return db
    .select({
      id: franchises.id,
      title: franchises.title,
      originalTitle: franchises.originalTitle,
    })
    .from(franchises)
    .orderBy(asc(franchises.title));
}

export async function franchiseExistsById(id: number) {
  const [franchise] = await db
    .select({ id: franchises.id })
    .from(franchises)
    .where(eq(franchises.id, id))
    .limit(1);

  return Boolean(franchise);
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
    .where(and(eq(mediaItems.franchiseId, franchiseId), publishedMediaItemCondition))
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
