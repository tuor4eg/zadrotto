import { and, asc, desc, eq, inArray, ne, not, notExists, or, sql } from "drizzle-orm";

import { db } from "@/db";
import { authors, franchises, mediaItems, ratings } from "@/db/schema";
import type { MediaType } from "@/lib/media-types";
import type { PublicationStatus } from "@/lib/publication-status";
import { PUBLISHED_PUBLICATION_STATUS } from "@/lib/publication-status";
import { resolveCoverUrl } from "@/lib/storage";

const publishedMediaItemCondition = eq(
  mediaItems.publicationStatus,
  PUBLISHED_PUBLICATION_STATUS,
);

const currentAuthorScoreSql = (currentAuthorId?: number) =>
  currentAuthorId
    ? sql<number | null>`(
        select ${ratings.score}
        from ${ratings}
        where ${ratings.mediaItemId} = ${mediaItems.id}
          and ${ratings.authorId} = ${currentAuthorId}
        limit 1
      )`
    : sql<number | null>`null`;

const catalogMediaItemsQuery = (currentAuthorId?: number) =>
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
      currentAuthorScore: currentAuthorScoreSql(currentAuthorId),
    })
    .from(mediaItems)
    .leftJoin(franchises, eq(franchises.id, mediaItems.franchiseId))
    .leftJoin(ratings, eq(ratings.mediaItemId, mediaItems.id))
    .where(publishedMediaItemCondition)
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

export async function getCatalogMediaItems(currentAuthorId?: number) {
  const items = await catalogMediaItemsQuery(currentAuthorId);

  return items.map((item) => ({
    ...item,
    coverUrl: resolveCoverUrl(item.coverUrl),
  }));
}

export async function getAuthorMediaItems(authorId: number) {
  return db
    .select({
      id: mediaItems.id,
      code: mediaItems.code,
      title: mediaItems.title,
      originalTitle: mediaItems.originalTitle,
      mediaType: mediaItems.mediaType,
      releaseYear: mediaItems.releaseYear,
      coverUrl: mediaItems.coverUrl,
      publicationStatus: mediaItems.publicationStatus,
      adminNote: mediaItems.adminNote,
      updatedAt: mediaItems.updatedAt,
    })
    .from(mediaItems)
    .where(eq(mediaItems.createdByAuthorId, authorId))
    .orderBy(asc(mediaItems.title));
}

export async function getAdminMediaItems() {
  const items = await db
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
      publicationStatus: mediaItems.publicationStatus,
      createdByAuthorId: mediaItems.createdByAuthorId,
      authorName: authors.name,
      authorCode: authors.code,
      averageScore: sql<number | null>`avg(${ratings.score})::float`,
      ratingsCount: sql<number>`count(${ratings.id})::int`,
      currentAuthorScore: sql<number | null>`null`,
    })
    .from(mediaItems)
    .leftJoin(franchises, eq(franchises.id, mediaItems.franchiseId))
    .leftJoin(authors, eq(authors.id, mediaItems.createdByAuthorId))
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
      mediaItems.publicationStatus,
      mediaItems.createdByAuthorId,
      authors.name,
      authors.code,
    )
    .orderBy(asc(mediaItems.title));

  return items.map((item) => ({
    ...item,
    coverUrl: resolveCoverUrl(item.coverUrl),
  }));
}

type AuthorMediaItemInput = {
  authorId: number;
  code: string;
  title: string;
  originalTitle: string | null;
  description: string | null;
  mediaType: MediaType;
  franchiseId: number | null;
  releaseYear: number | null;
  coverUrl: string | null;
};

export async function createAuthorMediaItem(input: AuthorMediaItemInput) {
  await db.insert(mediaItems).values({
    code: input.code,
    title: input.title,
    originalTitle: input.originalTitle,
    description: input.description,
    mediaType: input.mediaType,
    franchiseId: input.franchiseId,
    releaseYear: input.releaseYear,
    coverUrl: input.coverUrl,
    createdByAuthorId: input.authorId,
    publicationStatus: "private",
  });
}

export async function getAuthorMediaItemForEdit(authorId: number, mediaItemId: number) {
  const [item] = await db
    .select({
      id: mediaItems.id,
      title: mediaItems.title,
      originalTitle: mediaItems.originalTitle,
      description: mediaItems.description,
      mediaType: mediaItems.mediaType,
      franchiseId: mediaItems.franchiseId,
      releaseYear: mediaItems.releaseYear,
      coverUrl: mediaItems.coverUrl,
      publicationStatus: mediaItems.publicationStatus,
      adminNote: mediaItems.adminNote,
    })
    .from(mediaItems)
    .where(and(eq(mediaItems.id, mediaItemId), eq(mediaItems.createdByAuthorId, authorId)))
    .limit(1);

  return item ?? null;
}

export async function getAdminMediaItemForEdit(mediaItemId: number) {
  const [item] = await db
    .select({
      id: mediaItems.id,
      code: mediaItems.code,
      title: mediaItems.title,
      originalTitle: mediaItems.originalTitle,
      description: mediaItems.description,
      mediaType: mediaItems.mediaType,
      franchiseId: mediaItems.franchiseId,
      releaseYear: mediaItems.releaseYear,
      coverUrl: mediaItems.coverUrl,
      publicationStatus: mediaItems.publicationStatus,
      adminNote: mediaItems.adminNote,
      authorName: authors.name,
      authorCode: authors.code,
    })
    .from(mediaItems)
    .leftJoin(authors, eq(authors.id, mediaItems.createdByAuthorId))
    .where(eq(mediaItems.id, mediaItemId))
    .limit(1);

  return item
    ? {
        ...item,
        coverUrl: resolveCoverUrl(item.coverUrl),
      }
    : null;
}

export async function getAuthorMediaItemForView(authorId: number, mediaItemId: number) {
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
      publicationStatus: mediaItems.publicationStatus,
      adminNote: mediaItems.adminNote,
      averageScore: sql<number | null>`avg(${ratings.score})::float`,
      ratingsCount: sql<number>`count(${ratings.id})::int`,
      currentAuthorScore: currentAuthorScoreSql(authorId),
    })
    .from(mediaItems)
    .leftJoin(franchises, eq(franchises.id, mediaItems.franchiseId))
    .leftJoin(ratings, eq(ratings.mediaItemId, mediaItems.id))
    .where(and(eq(mediaItems.id, mediaItemId), eq(mediaItems.createdByAuthorId, authorId)))
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
      mediaItems.publicationStatus,
      mediaItems.adminNote,
    )
    .limit(1);

  return item ? { ...item, coverUrl: resolveCoverUrl(item.coverUrl) } : null;
}

export async function updateAuthorMediaItem(input: Omit<AuthorMediaItemInput, "code"> & {
  mediaItemId: number;
}) {
  await db
    .update(mediaItems)
    .set({
      title: input.title,
      originalTitle: input.originalTitle,
      description: input.description,
      mediaType: input.mediaType,
      franchiseId: input.franchiseId,
      releaseYear: input.releaseYear,
      coverUrl: input.coverUrl,
      updatedAt: new Date(),
    })
    .where(
      and(
        eq(mediaItems.id, input.mediaItemId),
        eq(mediaItems.createdByAuthorId, input.authorId),
        not(publishedMediaItemCondition),
      ),
    );
}

export async function updateAdminMediaItem(input: Omit<AuthorMediaItemInput, "authorId" | "code"> & {
  mediaItemId: number;
}) {
  const [item] = await db
    .update(mediaItems)
    .set({
      title: input.title,
      originalTitle: input.originalTitle,
      description: input.description,
      mediaType: input.mediaType,
      franchiseId: input.franchiseId,
      releaseYear: input.releaseYear,
      coverUrl: input.coverUrl,
      updatedAt: new Date(),
    })
    .where(eq(mediaItems.id, input.mediaItemId))
    .returning({
      id: mediaItems.id,
      code: mediaItems.code,
    });

  return item ?? null;
}

export async function submitAuthorMediaItemForPublication(input: {
  authorId: number;
  mediaItemId: number;
  nextStatus: Extract<PublicationStatus, "submitted" | "published">;
}) {
  const now = new Date();
  const [item] = await db
    .update(mediaItems)
    .set({
      publicationStatus: input.nextStatus,
      submittedAt: input.nextStatus === "submitted" ? now : null,
      reviewedByAdminId: null,
      reviewedAt: null,
      adminNote: null,
      updatedAt: now,
    })
    .where(
      and(
        eq(mediaItems.id, input.mediaItemId),
        eq(mediaItems.createdByAuthorId, input.authorId),
        inArray(mediaItems.publicationStatus, ["private", "rejected"]),
      ),
    )
    .returning({
      id: mediaItems.id,
      code: mediaItems.code,
      publicationStatus: mediaItems.publicationStatus,
    });

  return item ?? null;
}

export async function getSubmittedAuthorMediaItemsForAdmin() {
  const items = await db
    .select({
      id: mediaItems.id,
      code: mediaItems.code,
      title: mediaItems.title,
      originalTitle: mediaItems.originalTitle,
      description: mediaItems.description,
      mediaType: mediaItems.mediaType,
      franchiseTitle: franchises.title,
      releaseYear: mediaItems.releaseYear,
      coverUrl: mediaItems.coverUrl,
      submittedAt: mediaItems.submittedAt,
      updatedAt: mediaItems.updatedAt,
      authorName: authors.name,
      authorCode: authors.code,
    })
    .from(mediaItems)
    .innerJoin(authors, eq(authors.id, mediaItems.createdByAuthorId))
    .leftJoin(franchises, eq(franchises.id, mediaItems.franchiseId))
    .where(eq(mediaItems.publicationStatus, "submitted"))
    .orderBy(desc(mediaItems.submittedAt), desc(mediaItems.updatedAt));

  return items.map((item) => ({
    ...item,
    coverUrl: resolveCoverUrl(item.coverUrl),
  }));
}

export async function getAdminMediaItemIdentityById(mediaItemId: number) {
  const [item] = await db
    .select({
      id: mediaItems.id,
      code: mediaItems.code,
      franchiseId: mediaItems.franchiseId,
      franchiseCode: franchises.code,
      createdByAuthorId: mediaItems.createdByAuthorId,
      publicationStatus: mediaItems.publicationStatus,
      coverUrl: mediaItems.coverUrl,
    })
    .from(mediaItems)
    .leftJoin(franchises, eq(franchises.id, mediaItems.franchiseId))
    .where(eq(mediaItems.id, mediaItemId))
    .limit(1);

  return item ?? null;
}

export async function getSubmittedAuthorMediaItemForAdminView(mediaItemId: number) {
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
      submittedAt: mediaItems.submittedAt,
      authorName: authors.name,
      authorCode: authors.code,
      averageScore: sql<number | null>`avg(${ratings.score})::float`,
      ratingsCount: sql<number>`count(${ratings.id})::int`,
    })
    .from(mediaItems)
    .innerJoin(authors, eq(authors.id, mediaItems.createdByAuthorId))
    .leftJoin(franchises, eq(franchises.id, mediaItems.franchiseId))
    .leftJoin(ratings, eq(ratings.mediaItemId, mediaItems.id))
    .where(and(eq(mediaItems.id, mediaItemId), eq(mediaItems.publicationStatus, "submitted")))
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
      mediaItems.submittedAt,
      authors.name,
      authors.code,
    )
    .limit(1);

  return item ? { ...item, coverUrl: resolveCoverUrl(item.coverUrl) } : null;
}

export async function reviewSubmittedAuthorMediaItem(input: {
  mediaItemId: number;
  adminUserId: number;
  decision: Extract<PublicationStatus, "published" | "rejected">;
}) {
  const now = new Date();
  const [item] = await db
    .update(mediaItems)
    .set({
      publicationStatus: input.decision,
      reviewedByAdminId: input.adminUserId,
      reviewedAt: now,
      updatedAt: now,
    })
    .where(
      and(
        eq(mediaItems.id, input.mediaItemId),
        eq(mediaItems.publicationStatus, "submitted"),
      ),
    )
    .returning({
      id: mediaItems.id,
      code: mediaItems.code,
      publicationStatus: mediaItems.publicationStatus,
    });

  return item ?? null;
}

export async function deleteAdminMediaItemIfUnrated(mediaItemId: number) {
  const [item] = await db
    .delete(mediaItems)
    .where(
      and(
        eq(mediaItems.id, mediaItemId),
        notExists(
          db
            .select({ id: ratings.id })
            .from(ratings)
            .where(eq(ratings.mediaItemId, mediaItems.id)),
        ),
      ),
    )
    .returning({
      id: mediaItems.id,
      code: mediaItems.code,
    });

  return item ?? null;
}

export async function canViewMediaItemCover(objectKey: string, currentAuthorId?: number) {
  const visibilityCondition = currentAuthorId
    ? or(publishedMediaItemCondition, eq(mediaItems.createdByAuthorId, currentAuthorId))
    : publishedMediaItemCondition;
  const [item] = await db
    .select({ id: mediaItems.id })
    .from(mediaItems)
    .where(and(eq(mediaItems.coverUrl, objectKey), visibilityCondition))
    .limit(1);

  return Boolean(item);
}

export async function getMediaItemIdentityByCode(code: string) {
  const [item] = await db
    .select({
      id: mediaItems.id,
      code: mediaItems.code,
    })
    .from(mediaItems)
    .where(and(eq(mediaItems.code, code), publishedMediaItemCondition))
    .limit(1);

  return item ?? null;
}

export async function getMediaItemIdentityForAuthorRating(code: string, authorId: number) {
  const [item] = await db
    .select({
      id: mediaItems.id,
      code: mediaItems.code,
      franchiseCode: franchises.code,
    })
    .from(mediaItems)
    .leftJoin(franchises, eq(franchises.id, mediaItems.franchiseId))
    .where(
      and(
        eq(mediaItems.code, code),
        or(publishedMediaItemCondition, eq(mediaItems.createdByAuthorId, authorId)),
      ),
    )
    .limit(1);

  return item ?? null;
}

export async function getMediaItemByCode(code: string, currentAuthorId?: number) {
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
      currentAuthorScore: currentAuthorScoreSql(currentAuthorId),
    })
    .from(mediaItems)
    .leftJoin(franchises, eq(franchises.id, mediaItems.franchiseId))
    .leftJoin(ratings, eq(ratings.mediaItemId, mediaItems.id))
    .where(and(eq(mediaItems.code, code), publishedMediaItemCondition))
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
    .where(
      and(
        eq(mediaItems.franchiseId, franchiseId),
        ne(mediaItems.id, currentMediaItemId),
        publishedMediaItemCondition,
      ),
    )
    .orderBy(asc(mediaItems.releaseYear), asc(mediaItems.title));
}
