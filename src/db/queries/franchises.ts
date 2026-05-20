import { and, asc, eq, exists, isNull, ne, notExists, or, sql, type SQL } from "drizzle-orm";

import { db } from "@/db";
import { franchises, mediaItems, ratings } from "@/db/schema";
import { clampPage, getOffset, getTotalPages } from "@/lib/pagination";
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

function adminFranchiseSearchCondition(searchQuery: string) {
  const normalizedSearchQuery = searchQuery.trim().toLowerCase();

  if (!normalizedSearchQuery) {
    return undefined;
  }

  const pattern = `%${normalizedSearchQuery}%`;

  return or(
    sql`lower(${franchises.title}) like ${pattern}`,
    sql`lower(${franchises.originalTitle}) like ${pattern}`,
    sql`lower(${franchises.code}) like ${pattern}`,
  );
}

function adminFranchiseFilterConditions(input: {
  searchQuery: string;
}) {
  const conditions: SQL[] = [];
  const searchCondition = adminFranchiseSearchCondition(input.searchQuery);

  if (searchCondition) {
    conditions.push(searchCondition);
  }

  return conditions.length > 0 ? and(...conditions) : undefined;
}

export async function getAdminFranchises(input: {
  page: number;
  pageSize: number;
  searchQuery: string;
}) {
  const filterCondition = adminFranchiseFilterConditions(input);
  const [{ totalCount }] = await db
    .select({ totalCount: sql<number>`count(*)::int` })
    .from(franchises)
    .where(filterCondition);
  const totalPages = getTotalPages(totalCount, input.pageSize);
  const page = clampPage(input.page, totalPages);
  const items = await db
    .select({
      id: franchises.id,
      code: franchises.code,
      title: franchises.title,
      originalTitle: franchises.originalTitle,
      mediaItemsCount: sql<number>`count(${mediaItems.id})::int`,
    })
    .from(franchises)
    .leftJoin(mediaItems, eq(mediaItems.franchiseId, franchises.id))
    .where(filterCondition)
    .groupBy(
      franchises.id,
      franchises.code,
      franchises.title,
      franchises.originalTitle,
    )
    .orderBy(asc(franchises.title), asc(franchises.code))
    .limit(input.pageSize)
    .offset(getOffset(page, input.pageSize));

  return {
    items,
    page,
    pageSize: input.pageSize,
    totalCount,
    totalPages,
  };
}

export async function getAdminFranchiseById(id: number) {
  const [franchise] = await db
    .select({
      id: franchises.id,
      code: franchises.code,
      title: franchises.title,
      originalTitle: franchises.originalTitle,
      description: franchises.description,
      createdAt: franchises.createdAt,
      updatedAt: franchises.updatedAt,
    })
    .from(franchises)
    .where(eq(franchises.id, id))
    .limit(1);

  return franchise ?? null;
}

export async function franchiseExistsById(id: number) {
  const [franchise] = await db
    .select({ id: franchises.id })
    .from(franchises)
    .where(eq(franchises.id, id))
    .limit(1);

  return Boolean(franchise);
}

export async function createFranchise(input: {
  code: string;
  title: string;
  originalTitle: string | null;
  description: string | null;
}) {
  const [franchise] = await db
    .insert(franchises)
    .values(input)
    .returning({
      id: franchises.id,
      code: franchises.code,
    });

  return franchise;
}

export async function updateFranchise(input: {
  id: number;
  title: string;
  originalTitle: string | null;
  description: string | null;
}) {
  const [franchise] = await db
    .update(franchises)
    .set({
      title: input.title,
      originalTitle: input.originalTitle,
      description: input.description,
      updatedAt: new Date(),
    })
    .where(eq(franchises.id, input.id))
    .returning({
      id: franchises.id,
      code: franchises.code,
    });

  return franchise ?? null;
}

export async function deleteFranchiseIfEmpty(id: number) {
  const [franchise] = await db
    .delete(franchises)
    .where(
      and(
        eq(franchises.id, id),
        notExists(
          db
            .select({ id: mediaItems.id })
            .from(mediaItems)
            .where(eq(mediaItems.franchiseId, franchises.id)),
        ),
      ),
    )
    .returning({
      id: franchises.id,
      code: franchises.code,
    });

  return franchise ?? null;
}

export async function getMediaItemsByFranchiseId(franchiseId: number, currentAuthorId?: number) {
  const items = await db
    .select({
      id: mediaItems.id,
      code: mediaItems.code,
      title: mediaItems.title,
      originalTitle: mediaItems.originalTitle,
      description: mediaItems.description,
      mediaType: mediaItems.mediaType,
      releaseYear: mediaItems.releaseYear,
      coverUrl: mediaItems.coverUrl,
      averageScore: sql<number | null>`avg(${ratings.score})::float`,
      ratingsCount: sql<number>`count(${ratings.id})::int`,
      currentAuthorScore: currentAuthorScoreSql(currentAuthorId),
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
      mediaItems.coverUrl,
    )
    .orderBy(sql`${mediaItems.releaseYear} asc nulls last`, asc(mediaItems.title));

  return items.map((item) => ({ ...item, coverUrl: resolveCoverUrl(item.coverUrl) }));
}

export async function getAdminMediaItemsByFranchiseId(franchiseId: number) {
  return db
    .select({
      id: mediaItems.id,
      code: mediaItems.code,
      title: mediaItems.title,
      originalTitle: mediaItems.originalTitle,
      mediaType: mediaItems.mediaType,
      releaseYear: mediaItems.releaseYear,
      publicationStatus: mediaItems.publicationStatus,
    })
    .from(mediaItems)
    .where(eq(mediaItems.franchiseId, franchiseId))
    .orderBy(sql`${mediaItems.releaseYear} asc nulls last`, asc(mediaItems.title));
}

export async function getAdminMediaItemsAvailableForFranchise(franchiseId: number) {
  return db
    .select({
      id: mediaItems.id,
      code: mediaItems.code,
      title: mediaItems.title,
      originalTitle: mediaItems.originalTitle,
      mediaType: mediaItems.mediaType,
      releaseYear: mediaItems.releaseYear,
      publicationStatus: mediaItems.publicationStatus,
      franchiseId: mediaItems.franchiseId,
      franchiseCode: franchises.code,
      franchiseTitle: franchises.title,
    })
    .from(mediaItems)
    .leftJoin(franchises, eq(franchises.id, mediaItems.franchiseId))
    .where(or(isNull(mediaItems.franchiseId), ne(mediaItems.franchiseId, franchiseId)))
    .orderBy(asc(mediaItems.title), asc(mediaItems.code));
}

export async function getAdminMediaItemFranchiseIdentityById(id: number) {
  const [item] = await db
    .select({
      id: mediaItems.id,
      code: mediaItems.code,
      franchiseId: mediaItems.franchiseId,
      franchiseCode: franchises.code,
    })
    .from(mediaItems)
    .leftJoin(franchises, eq(franchises.id, mediaItems.franchiseId))
    .where(eq(mediaItems.id, id))
    .limit(1);

  return item ?? null;
}

export async function addMediaItemToFranchise(input: {
  franchiseId: number;
  mediaItemId: number;
}) {
  const [item] = await db
    .update(mediaItems)
    .set({
      franchiseId: input.franchiseId,
      updatedAt: new Date(),
    })
    .where(
      and(
        eq(mediaItems.id, input.mediaItemId),
        or(isNull(mediaItems.franchiseId), ne(mediaItems.franchiseId, input.franchiseId)),
      ),
    )
    .returning({
      id: mediaItems.id,
      code: mediaItems.code,
    });

  return item ?? null;
}

export async function removeMediaItemFromFranchise(input: {
  franchiseId: number;
  mediaItemId: number;
}) {
  const [item] = await db
    .update(mediaItems)
    .set({
      franchiseId: null,
      updatedAt: new Date(),
    })
    .where(
      and(
        eq(mediaItems.id, input.mediaItemId),
        eq(mediaItems.franchiseId, input.franchiseId),
      ),
    )
    .returning({
      id: mediaItems.id,
      code: mediaItems.code,
    });

  return item ?? null;
}

export type FranchiseMediaItem = Awaited<
  ReturnType<typeof getMediaItemsByFranchiseId>
>[number];
