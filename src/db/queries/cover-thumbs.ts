import { and, asc, eq, isNotNull, isNull } from "drizzle-orm";

import { db } from "@/db";
import { mediaItems } from "@/db/schema";

export async function getMediaItemsMissingCoverThumb(input: { limit?: number } = {}) {
  const query = db
    .select({
      id: mediaItems.id,
      title: mediaItems.title,
      coverUrl: mediaItems.coverUrl,
    })
    .from(mediaItems)
    .where(and(isNotNull(mediaItems.coverUrl), isNull(mediaItems.coverThumbUrl)))
    .orderBy(asc(mediaItems.id));

  return input.limit ? query.limit(input.limit) : query;
}

export async function updateMediaItemCoverThumb(input: {
  mediaItemId: number;
  coverThumbUrl: string;
}) {
  await db
    .update(mediaItems)
    .set({
      coverThumbUrl: input.coverThumbUrl,
      updatedAt: new Date(),
    })
    .where(eq(mediaItems.id, input.mediaItemId));
}
