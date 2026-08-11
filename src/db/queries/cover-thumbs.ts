import { and, asc, eq, isNotNull, isNull, notIlike, sql } from "drizzle-orm";

import { db } from "@/db";
import { mediaItems } from "@/db/schema";

export async function getMediaItemsMissingCoverThumb(input: {
  limit?: number;
  mediaItemId?: number;
} = {}) {
  const conditions = [
    isNotNull(mediaItems.coverUrl),
    isNull(mediaItems.coverThumbUrl),
    notIlike(mediaItems.coverUrl, "http%"),
  ];

  if (input.mediaItemId) {
    conditions.push(eq(mediaItems.id, input.mediaItemId));
  }

  const query = db
    .select({
      id: mediaItems.id,
      title: mediaItems.title,
      coverUrl: mediaItems.coverUrl,
      createdByAuthorId: mediaItems.createdByAuthorId,
      coverThumbAttemptedAt: mediaItems.coverThumbAttemptedAt,
    })
    .from(mediaItems)
    .where(and(...conditions))
    .orderBy(sql`${mediaItems.coverThumbAttemptedAt} asc nulls first`, asc(mediaItems.id));

  return input.limit ? query.limit(input.limit) : query;
}

export async function markMediaItemCoverThumbAttempt(input: {
  expectedCoverUrl: string;
  mediaItemId: number;
}) {
  await db
    .update(mediaItems)
    .set({ coverThumbAttemptedAt: new Date() })
    .where(
      and(
        eq(mediaItems.id, input.mediaItemId),
        eq(mediaItems.coverUrl, input.expectedCoverUrl),
        isNull(mediaItems.coverThumbUrl),
      ),
    );
}

export async function isMediaItemCoverThumbReferenced(input: {
  coverThumbUrl: string;
  mediaItemId: number;
}) {
  const [item] = await db
    .select({ id: mediaItems.id })
    .from(mediaItems)
    .where(
      and(
        eq(mediaItems.id, input.mediaItemId),
        eq(mediaItems.coverThumbUrl, input.coverThumbUrl),
      ),
    )
    .limit(1);

  return Boolean(item);
}

export async function updateMediaItemCoverThumb(input: {
  mediaItemId: number;
  expectedCoverUrl: string;
  coverThumbUrl: string;
}) {
  const [item] = await db
    .update(mediaItems)
    .set({
      coverThumbUrl: input.coverThumbUrl,
      coverThumbAttemptedAt: null,
      updatedAt: new Date(),
    })
    .where(
      and(
        eq(mediaItems.id, input.mediaItemId),
        eq(mediaItems.coverUrl, input.expectedCoverUrl),
        isNull(mediaItems.coverThumbUrl),
      ),
    )
    .returning({ id: mediaItems.id });

  return Boolean(item);
}
