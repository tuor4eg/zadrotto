import { and, asc, eq, ne, sql } from "drizzle-orm";

import { db } from "@/db";
import { franchises, mediaItems, ratings } from "@/db/schema";
import { resolveCoverUrl } from "@/lib/storage";

const catalogMediaItemsQuery = () =>
  db
    .select({
      id: mediaItems.id,
      code: mediaItems.code,
      title: mediaItems.title,
      originalTitle: mediaItems.originalTitle,
      description: mediaItems.description,
      mediaType: mediaItems.mediaType,
      franchiseId: mediaItems.franchiseId,
      franchiseCode: franchises.code,
      franchiseTitle: franchises.title,
      releaseYear: mediaItems.releaseYear,
      coverUrl: mediaItems.coverUrl,
      averageScore: sql<number | null>`avg(${ratings.score})::float`,
      ratingsCount: sql<number>`count(${ratings.id})::int`,
    })
    .from(mediaItems)
    .leftJoin(franchises, eq(franchises.id, mediaItems.franchiseId))
    .leftJoin(ratings, eq(ratings.mediaItemId, mediaItems.id))
    .groupBy(
      mediaItems.id,
      mediaItems.code,
      mediaItems.title,
      mediaItems.originalTitle,
      mediaItems.description,
      mediaItems.mediaType,
      mediaItems.franchiseId,
      franchises.code,
      franchises.title,
      mediaItems.releaseYear,
      mediaItems.coverUrl,
    )
    .orderBy(asc(mediaItems.title));

export type CatalogMediaItem = Awaited<
  ReturnType<typeof getCatalogMediaItems>
>[number];

export async function getCatalogMediaItems() {
  const items = await catalogMediaItemsQuery();

  return items.map((item) => ({
    ...item,
    coverUrl: resolveCoverUrl(item.coverUrl),
  }));
}

export async function getArchiveStats() {
  const [franchiseTotals, ratingTotals] = await Promise.all([
    db
      .select({
        franchisesCount: sql<number>`count(${franchises.id})::int`,
      })
      .from(franchises),
    db
      .select({
        ratingsCount: sql<number>`count(${ratings.id})::int`,
        ratingAuthorsCount: sql<number>`count(distinct ${ratings.authorId})::int`,
      })
      .from(ratings),
  ]);

  return {
    franchisesCount: franchiseTotals[0]?.franchisesCount ?? 0,
    ratingsCount: ratingTotals[0]?.ratingsCount ?? 0,
    ratingAuthorsCount: ratingTotals[0]?.ratingAuthorsCount ?? 0,
  };
}

export async function getMediaItemByCode(code: string) {
  const [item] = await db
    .select({
      id: mediaItems.id,
      code: mediaItems.code,
      title: mediaItems.title,
      originalTitle: mediaItems.originalTitle,
      description: mediaItems.description,
      mediaType: mediaItems.mediaType,
      franchiseId: mediaItems.franchiseId,
      franchiseCode: franchises.code,
      franchiseTitle: franchises.title,
      releaseYear: mediaItems.releaseYear,
      coverUrl: mediaItems.coverUrl,
      averageScore: sql<number | null>`avg(${ratings.score})::float`,
      ratingsCount: sql<number>`count(${ratings.id})::int`,
    })
    .from(mediaItems)
    .leftJoin(franchises, eq(franchises.id, mediaItems.franchiseId))
    .leftJoin(ratings, eq(ratings.mediaItemId, mediaItems.id))
    .where(eq(mediaItems.code, code))
    .groupBy(
      mediaItems.id,
      mediaItems.code,
      mediaItems.title,
      mediaItems.originalTitle,
      mediaItems.description,
      mediaItems.mediaType,
      mediaItems.franchiseId,
      franchises.code,
      franchises.title,
      mediaItems.releaseYear,
      mediaItems.coverUrl,
    )
    .limit(1);

  return item ? { ...item, coverUrl: resolveCoverUrl(item.coverUrl) } : null;
}

export async function getOtherMediaItemsFromFranchise(
  franchiseId: number,
  currentMediaItemId: number,
) {
  return db
    .select({
      id: mediaItems.id,
      code: mediaItems.code,
      title: mediaItems.title,
      originalTitle: mediaItems.originalTitle,
      mediaType: mediaItems.mediaType,
      releaseYear: mediaItems.releaseYear,
    })
    .from(mediaItems)
    .where(and(eq(mediaItems.franchiseId, franchiseId), ne(mediaItems.id, currentMediaItemId)))
    .orderBy(asc(mediaItems.releaseYear), asc(mediaItems.title));
}
