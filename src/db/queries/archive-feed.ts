import { and, desc, eq, inArray, sql } from "drizzle-orm";

import { db } from "@/db";
import {
  authors,
  contributionReviews,
  contributions,
  editorialCollections,
  editorialDocumentBlocks,
  franchises,
  mediaItemFranchises,
  mediaItems,
} from "@/db/schema";
import { PUBLISHED_CONTRIBUTION_STATUS } from "@/lib/contributions/model";
import { resolveCollectionImageUrl } from "@/lib/collections/images";
import { PUBLISHED_PUBLICATION_STATUS } from "@/lib/media/publication-status";
import { resolveCoverUrl } from "@/lib/services/minio";

const ARCHIVE_FEED_SIZE = 12;

export type ArchiveFeedItem = {
  createdAt: Date;
  href: string;
  imageUrl: string | null;
  key: string;
  kind: "collection" | "media" | "review" | "series";
  meta: string;
  title: string;
};

export async function getLatestArchiveFeed(
  enabledMediaTypes: readonly { code: string; name: string }[],
): Promise<ArchiveFeedItem[]> {
  const enabledMediaTypeCodes = enabledMediaTypes.map((mediaType) => mediaType.code);

  const [mediaRows, reviewRows, seriesRows, collectionRows] = await Promise.all([
    db
      .select({
        code: mediaItems.code,
        coverThumbUrl: mediaItems.coverThumbUrl,
        coverUrl: mediaItems.coverUrl,
        createdAt: mediaItems.createdAt,
        mediaType: mediaItems.mediaType,
        releaseYear: mediaItems.releaseYear,
        title: mediaItems.title,
      })
      .from(mediaItems)
      .where(and(
        eq(mediaItems.publicationStatus, PUBLISHED_PUBLICATION_STATUS),
        inArray(mediaItems.mediaType, [...enabledMediaTypeCodes]),
      ))
      .orderBy(desc(mediaItems.createdAt), desc(mediaItems.id))
      .limit(ARCHIVE_FEED_SIZE),
    db
      .select({
        authorName: authors.name,
        coverThumbUrl: mediaItems.coverThumbUrl,
        coverUrl: mediaItems.coverUrl,
        createdAt: sql<Date>`coalesce(${contributions.reviewedAt}, ${contributions.updatedAt})`
          .mapWith(contributions.updatedAt),
        id: contributions.id,
        mediaItemCode: mediaItems.code,
        mediaItemTitle: mediaItems.title,
        reviewTitle: contributionReviews.title,
      })
      .from(contributions)
      .innerJoin(contributionReviews, eq(contributionReviews.contributionId, contributions.id))
      .innerJoin(authors, eq(authors.id, contributions.authorId))
      .innerJoin(mediaItems, eq(mediaItems.id, contributions.primaryMediaItemId))
      .where(and(
        eq(contributions.type, "review"),
        eq(contributions.status, PUBLISHED_CONTRIBUTION_STATUS),
        eq(mediaItems.publicationStatus, PUBLISHED_PUBLICATION_STATUS),
        inArray(mediaItems.mediaType, [...enabledMediaTypeCodes]),
      ))
      .orderBy(
        desc(sql`coalesce(${contributions.reviewedAt}, ${contributions.updatedAt})`),
        desc(contributions.id),
      )
      .limit(ARCHIVE_FEED_SIZE),
    db
      .select({
        code: franchises.code,
        createdAt: franchises.createdAt,
        id: franchises.id,
        title: franchises.title,
      })
      .from(franchises)
      .where(eq(franchises.publicationStatus, PUBLISHED_PUBLICATION_STATUS))
      .orderBy(desc(franchises.createdAt), desc(franchises.id))
      .limit(ARCHIVE_FEED_SIZE),
    db
      .select({
        coverObjectKey: editorialCollections.coverObjectKey,
        createdAt: editorialCollections.updatedAt,
        id: editorialCollections.id,
        itemsCount: sql<number>`count(${editorialDocumentBlocks.mediaItemId}) filter (where ${editorialDocumentBlocks.blockType} = 'media')::int`,
        slug: editorialCollections.slug,
        title: editorialCollections.title,
      })
      .from(editorialCollections)
      .leftJoin(
        editorialDocumentBlocks,
        eq(editorialDocumentBlocks.documentId, editorialCollections.documentId),
      )
      .where(eq(editorialCollections.publicationStatus, PUBLISHED_PUBLICATION_STATUS))
      .groupBy(editorialCollections.id)
      .orderBy(desc(editorialCollections.updatedAt), desc(editorialCollections.id))
      .limit(ARCHIVE_FEED_SIZE),
  ]);

  const seriesIds = seriesRows.map((series) => series.id);
  const seriesCoverRows = seriesIds.length > 0
    ? await db
        .select({
          coverThumbUrl: mediaItems.coverThumbUrl,
          coverUrl: mediaItems.coverUrl,
          franchiseId: mediaItemFranchises.franchiseId,
        })
        .from(mediaItemFranchises)
        .innerJoin(mediaItems, eq(mediaItems.id, mediaItemFranchises.mediaItemId))
        .where(and(
          inArray(mediaItemFranchises.franchiseId, seriesIds),
          eq(mediaItemFranchises.publicationStatus, PUBLISHED_PUBLICATION_STATUS),
          eq(mediaItems.publicationStatus, PUBLISHED_PUBLICATION_STATUS),
          inArray(mediaItems.mediaType, [...enabledMediaTypeCodes]),
        ))
        .orderBy(desc(mediaItems.createdAt), desc(mediaItems.id))
    : [];
  const seriesCoverById = new Map<number, string | null>();

  for (const cover of seriesCoverRows) {
    if (!seriesCoverById.has(cover.franchiseId)) {
      seriesCoverById.set(
        cover.franchiseId,
        resolveCoverUrl(cover.coverThumbUrl) ?? resolveCoverUrl(cover.coverUrl),
      );
    }
  }

  return [
    ...mediaRows.map((item): ArchiveFeedItem => ({
      createdAt: item.createdAt,
      href: `/media/${item.code}`,
      imageUrl: resolveCoverUrl(item.coverThumbUrl) ?? resolveCoverUrl(item.coverUrl),
      key: `media-${item.code}`,
      kind: "media",
      meta: [
        enabledMediaTypes.find((mediaType) => mediaType.code === item.mediaType)?.name ?? item.mediaType,
        item.releaseYear,
      ].filter(Boolean).join(" · "),
      title: item.title,
    })),
    ...seriesRows.map((item): ArchiveFeedItem => ({
      createdAt: item.createdAt,
      href: `/series/${item.code}`,
      imageUrl: seriesCoverById.get(item.id) ?? null,
      key: `series-${item.code}`,
      kind: "series",
      meta: "Серия",
      title: item.title,
    })),
    ...reviewRows.map((item): ArchiveFeedItem => ({
      createdAt: item.createdAt,
      href: `/reviews/${item.id}`,
      imageUrl: resolveCoverUrl(item.coverThumbUrl) ?? resolveCoverUrl(item.coverUrl),
      key: `review-${item.id}`,
      kind: "review",
      meta: `${item.mediaItemTitle} · ${item.authorName}`,
      title: item.reviewTitle,
    })),
    ...collectionRows.map((item): ArchiveFeedItem => ({
      createdAt: item.createdAt,
      href: `/collections/${item.slug}`,
      imageUrl: resolveCollectionImageUrl(item.coverObjectKey),
      key: `collection-${item.id}`,
      kind: "collection",
      meta: `${item.itemsCount} записей`,
      title: item.title,
    })),
  ]
    .sort((left, right) => right.createdAt.getTime() - left.createdAt.getTime())
    .slice(0, ARCHIVE_FEED_SIZE);
}
