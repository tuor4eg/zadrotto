import { asc, eq, sql } from "drizzle-orm";

import { db } from "@/db";
import { mediaItems, ratings } from "@/db/schema";

const catalogMediaItemsQuery = () =>
  db
    .select({
      id: mediaItems.id,
      title: mediaItems.title,
      originalTitle: mediaItems.originalTitle,
      mediaType: mediaItems.mediaType,
      releaseYear: mediaItems.releaseYear,
      coverUrl: mediaItems.coverUrl,
      averageScore: sql<number | null>`avg(${ratings.score})::float`,
    })
    .from(mediaItems)
    .leftJoin(ratings, eq(ratings.mediaItemId, mediaItems.id))
    .groupBy(
      mediaItems.id,
      mediaItems.title,
      mediaItems.originalTitle,
      mediaItems.mediaType,
      mediaItems.releaseYear,
      mediaItems.coverUrl,
    )
    .orderBy(asc(mediaItems.title));

export type CatalogMediaItem = Awaited<
  ReturnType<ReturnType<typeof catalogMediaItemsQuery>["execute"]>
>[number];

export async function getCatalogMediaItems() {
  return catalogMediaItemsQuery();
}
