import { and, desc, eq, exists, inArray, or } from "drizzle-orm";

import { db } from "@/db";
import { getMediaTypeCodeFilterSql } from "@/db/queries/media-types";
import { containsNormalizedSearchSql } from "@/db/search";
import {
  contributions,
  mediaItems,
  mediaItemTitleAliases,
  mediaTypes,
} from "@/db/schema";
import { PUBLISHED_PUBLICATION_STATUS } from "@/lib/media/publication-status";
import { normalizeSearchText } from "@/lib/search/normalize";
import { resolveCoverUrl } from "@/lib/services/minio";

export async function searchPublishedMediaItems(input: {
  query: string;
  accessibleMediaTypeCodes: readonly string[];
  authorId?: number;
  limit?: number;
}) {
  const normalizedQuery = normalizeSearchText(input.query);
  if (!normalizedQuery || input.accessibleMediaTypeCodes.length === 0) return [];

  const condition = and(
    eq(mediaItems.publicationStatus, PUBLISHED_PUBLICATION_STATUS),
    getMediaTypeCodeFilterSql(mediaItems.mediaType, input.accessibleMediaTypeCodes),
    or(
      containsNormalizedSearchSql(mediaItems.title, normalizedQuery),
      containsNormalizedSearchSql(mediaItems.originalTitle, normalizedQuery),
      containsNormalizedSearchSql(mediaItems.code, normalizedQuery),
      exists(
        db
          .select({ id: mediaItemTitleAliases.id })
          .from(mediaItemTitleAliases)
          .where(and(
            eq(mediaItemTitleAliases.mediaItemId, mediaItems.id),
            containsNormalizedSearchSql(mediaItemTitleAliases.value, normalizedQuery),
          )),
      ),
    ),
  );

  const selection = {
    id: mediaItems.id,
    code: mediaItems.code,
    title: mediaItems.title,
    originalTitle: mediaItems.originalTitle,
    mediaType: mediaItems.mediaType,
    mediaTypeName: mediaTypes.name,
    releaseYear: mediaItems.releaseYear,
    coverUrl: mediaItems.coverUrl,
    coverThumbUrl: mediaItems.coverThumbUrl,
    existingReviewId: contributions.id,
  };

  const query = db
    .select(selection)
    .from(mediaItems)
    .innerJoin(mediaTypes, eq(mediaTypes.code, mediaItems.mediaType))
    .leftJoin(
      contributions,
      input.authorId === undefined
        ? eq(contributions.id, -1)
        : and(
          eq(contributions.primaryMediaItemId, mediaItems.id),
          eq(contributions.authorId, input.authorId),
          eq(contributions.type, "review"),
        ),
    )
    .where(condition)
    .orderBy(desc(mediaItems.updatedAt), desc(mediaItems.id))
    .limit(Math.min(Math.max(input.limit ?? 30, 1), 30));

  const rows = await query;
  return rows.map((item) => ({
    ...item,
    coverUrl: resolveCoverUrl(item.coverUrl),
    coverThumbUrl: resolveCoverUrl(item.coverThumbUrl),
  }));
}

export async function resolvePublishedMediaItemsByIds(input: {
  ids: readonly number[];
  accessibleMediaTypeCodes: readonly string[];
}) {
  if (input.ids.length === 0 || input.accessibleMediaTypeCodes.length === 0) return [];

  return db
    .select({ id: mediaItems.id, code: mediaItems.code })
    .from(mediaItems)
    .where(and(
      inArray(mediaItems.id, [...new Set(input.ids)]),
      eq(mediaItems.publicationStatus, PUBLISHED_PUBLICATION_STATUS),
      getMediaTypeCodeFilterSql(mediaItems.mediaType, input.accessibleMediaTypeCodes),
    ));
}
