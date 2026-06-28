import { and, asc, eq, exists, inArray, notExists, or, sql, type SQL } from "drizzle-orm";

import { db } from "@/db";
import { franchises, mediaCarriers, mediaItemFranchises, mediaItems, ratings } from "@/db/schema";
import { clampPage, getOffset, getTotalPages } from "@/lib/common/pagination";
import { PUBLISHED_PUBLICATION_STATUS } from "@/lib/media/publication-status";
import { resolveCoverUrl } from "@/lib/services/minio";

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

type FranchiseLink = {
  id: number;
  code: string;
  title: string;
  originalTitle: string | null;
};

const franchisesJsonSql = (mediaItemId = mediaItems.id) => sql<FranchiseLink[]>`coalesce((
  select jsonb_agg(
    jsonb_build_object(
      'id', ${franchises.id},
      'code', ${franchises.code},
      'title', ${franchises.title},
      'originalTitle', ${franchises.originalTitle}
    )
    order by ${franchises.title}, ${franchises.code}
  )
  from ${mediaItemFranchises}
  inner join ${franchises} on ${franchises.id} = ${mediaItemFranchises.franchiseId}
  where ${mediaItemFranchises.mediaItemId} = ${mediaItemId}
), '[]'::jsonb)`;

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
            .innerJoin(
              mediaItemFranchises,
              eq(mediaItemFranchises.mediaItemId, mediaItems.id),
            )
            .where(
              and(
                eq(mediaItemFranchises.franchiseId, franchises.id),
                publishedMediaItemCondition,
              ),
            ),
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
      mediaItemsCount: sql<number>`count(${mediaItemFranchises.mediaItemId})::int`,
    })
    .from(franchises)
    .leftJoin(mediaItemFranchises, eq(mediaItemFranchises.franchiseId, franchises.id))
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

export async function franchiseIdsExist(ids: number[]) {
  const uniqueIds = [...new Set(ids)];

  if (uniqueIds.length === 0) {
    return true;
  }

  const rows = await db
    .select({ id: franchises.id })
    .from(franchises)
    .where(inArray(franchises.id, uniqueIds));

  return rows.length === uniqueIds.length;
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
      title: franchises.title,
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
      title: franchises.title,
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
            .select({ id: mediaItemFranchises.mediaItemId })
            .from(mediaItemFranchises)
            .where(eq(mediaItemFranchises.franchiseId, franchises.id)),
        ),
      ),
    )
    .returning({
      id: franchises.id,
      code: franchises.code,
      title: franchises.title,
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
      mediaCarrierCode: mediaCarriers.code,
      mediaCarrierName: mediaCarriers.name,
      releaseYear: mediaItems.releaseYear,
      coverUrl: mediaItems.coverUrl,
      coverThumbUrl: mediaItems.coverThumbUrl,
      averageScore: sql<number | null>`avg(${ratings.score})::float`,
      ratingsCount: sql<number>`count(${ratings.id})::int`,
      currentAuthorScore: currentAuthorScoreSql(currentAuthorId),
    })
    .from(mediaItems)
    .innerJoin(mediaItemFranchises, eq(mediaItemFranchises.mediaItemId, mediaItems.id))
    .leftJoin(mediaCarriers, eq(mediaCarriers.id, mediaItems.mediaCarrierId))
    .leftJoin(ratings, eq(ratings.mediaItemId, mediaItems.id))
    .where(and(eq(mediaItemFranchises.franchiseId, franchiseId), publishedMediaItemCondition))
    .groupBy(
      mediaItems.id,
      mediaItems.code,
      mediaItems.title,
      mediaItems.originalTitle,
      mediaItems.description,
      mediaItems.mediaType,
      mediaCarriers.code,
      mediaCarriers.name,
      mediaItems.releaseYear,
      mediaItems.coverUrl,
      mediaItems.coverThumbUrl,
    )
    .orderBy(sql`${mediaItems.releaseYear} asc nulls last`, asc(mediaItems.title));

  return items.map((item) => ({
    ...item,
    coverUrl: resolveCoverUrl(item.coverUrl),
    coverThumbUrl: resolveCoverUrl(item.coverThumbUrl),
  }));
}

export async function getAdminMediaItemsByFranchiseId(franchiseId: number) {
  const items = await db
    .select({
      id: mediaItems.id,
      code: mediaItems.code,
      title: mediaItems.title,
      originalTitle: mediaItems.originalTitle,
      mediaType: mediaItems.mediaType,
      coverUrl: mediaItems.coverUrl,
      coverThumbUrl: mediaItems.coverThumbUrl,
      releaseYear: mediaItems.releaseYear,
      publicationStatus: mediaItems.publicationStatus,
    })
    .from(mediaItems)
    .innerJoin(mediaItemFranchises, eq(mediaItemFranchises.mediaItemId, mediaItems.id))
    .where(eq(mediaItemFranchises.franchiseId, franchiseId))
    .orderBy(sql`${mediaItems.releaseYear} asc nulls last`, asc(mediaItems.title));

  return items.map((item) => ({
    ...item,
    coverUrl: resolveCoverUrl(item.coverUrl),
    coverThumbUrl: resolveCoverUrl(item.coverThumbUrl),
  }));
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
      franchises: franchisesJsonSql(),
    })
    .from(mediaItems)
    .where(
      notExists(
        db
          .select({ mediaItemId: mediaItemFranchises.mediaItemId })
          .from(mediaItemFranchises)
          .where(
            and(
              eq(mediaItemFranchises.mediaItemId, mediaItems.id),
              eq(mediaItemFranchises.franchiseId, franchiseId),
            ),
          ),
      ),
    )
    .orderBy(asc(mediaItems.title), asc(mediaItems.code));
}

export async function getAdminMediaItemFranchiseIdentityById(id: number) {
  const [item] = await db
    .select({
      id: mediaItems.id,
      code: mediaItems.code,
      title: mediaItems.title,
      franchises: franchisesJsonSql(),
    })
    .from(mediaItems)
    .where(eq(mediaItems.id, id))
    .limit(1);

  return item ?? null;
}

export async function addMediaItemToFranchise(input: {
  franchiseId: number;
  mediaItemId: number;
}) {
  const [item] = await db
    .insert(mediaItemFranchises)
    .values({
      mediaItemId: input.mediaItemId,
      franchiseId: input.franchiseId,
    })
    .onConflictDoNothing()
    .returning({
      id: mediaItemFranchises.mediaItemId,
    });

  if (!item) {
    return null;
  }

  const [mediaItem] = await db
    .update(mediaItems)
    .set({ updatedAt: new Date() })
    .where(eq(mediaItems.id, input.mediaItemId))
    .returning({
      id: mediaItems.id,
      code: mediaItems.code,
      title: mediaItems.title,
    });

  return mediaItem ?? null;
}

export async function removeMediaItemFromFranchise(input: {
  franchiseId: number;
  mediaItemId: number;
}) {
  const [item] = await db
    .delete(mediaItemFranchises)
    .where(
      and(
        eq(mediaItemFranchises.mediaItemId, input.mediaItemId),
        eq(mediaItemFranchises.franchiseId, input.franchiseId),
      ),
    )
    .returning({
      id: mediaItemFranchises.mediaItemId,
    });

  if (!item) {
    return null;
  }

  const [mediaItem] = await db
    .update(mediaItems)
    .set({ updatedAt: new Date() })
    .where(eq(mediaItems.id, input.mediaItemId))
    .returning({
      id: mediaItems.id,
      code: mediaItems.code,
      title: mediaItems.title,
    });

  return mediaItem ?? null;
}

export type FranchiseMediaItem = Awaited<
  ReturnType<typeof getMediaItemsByFranchiseId>
>[number];
