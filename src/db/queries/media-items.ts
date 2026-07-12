import {
  and,
  asc,
  desc,
  eq,
  exists,
  gte,
  inArray,
  isNull,
  ne,
  not,
  or,
  sql,
  type SQL,
} from "drizzle-orm";

import type {
  AuthorRatingFilter,
  CatalogSort,
  CatalogSortDirection,
  CatalogYearFilter,
  CatalogYearMode,
  MediaTypeFilter,
} from "@/app/media-items-catalog-logic";
import { DEFAULT_CATALOG_SORT_DIRECTIONS } from "@/app/media-items-catalog-logic";
import { db } from "@/db";
import type { DbTransaction } from "@/db/transaction";
import {
  authorMediaExperiences,
  authors,
  contributionMediaItems,
  contributions,
  franchises,
  mediaItemFranchises,
  mediaItemMetadata,
  mediaCarriers,
  mediaItems,
  ratings,
} from "@/db/schema";
import type { MediaType } from "@/lib/media/types";
import type { PublicationStatus } from "@/lib/media/publication-status";
import { PUBLISHED_PUBLICATION_STATUS } from "@/lib/media/publication-status";
import { clampPage, getOffset, getTotalPages } from "@/lib/common/pagination";
import { resolveCoverUrl } from "@/lib/services/minio";
import type { CoverSourceInput } from "@/lib/covers/types";
import type {
  MediaItemDuplicateCheckInput,
  MediaItemDuplicateMatch,
} from "@/lib/media/media-item-duplicates";

const publishedMediaItemCondition = eq(
  mediaItems.publicationStatus,
  PUBLISHED_PUBLICATION_STATUS,
);

export type MediaItemFranchiseLink = {
  id: number;
  code: string;
  title: string;
  originalTitle: string | null;
};

export function normalizeMediaItemFranchises(
  franchisesValue: MediaItemFranchiseLink[] | null,
) {
  if (!franchisesValue) {
    return [];
  }

  const seenIds = new Set<number>();

  return franchisesValue.filter((franchise) => {
    if (seenIds.has(franchise.id)) {
      return false;
    }

    seenIds.add(franchise.id);
    return true;
  });
}

const franchisesJsonSql = (mediaItemId = mediaItems.id) => sql<MediaItemFranchiseLink[]>`coalesce((
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

const franchiseIdsSql = (mediaItemId = mediaItems.id) => sql<number[]>`coalesce((
  select array_agg(${mediaItemFranchises.franchiseId} order by ${franchises.title}, ${franchises.code})
  from ${mediaItemFranchises}
  inner join ${franchises} on ${franchises.id} = ${mediaItemFranchises.franchiseId}
  where ${mediaItemFranchises.mediaItemId} = ${mediaItemId}
), array[]::integer[])`;

function withResolvedFranchises<T extends { franchises: MediaItemFranchiseLink[] | null }>(
  item: T,
) {
  return {
    ...item,
    franchises: normalizeMediaItemFranchises(item.franchises),
  };
}

export async function setMediaItemFranchisesForExecutor(
  executor: Pick<typeof db, "delete" | "insert"> | Pick<DbTransaction, "delete" | "insert">,
  mediaItemId: number,
  franchiseIds: number[],
) {
  const uniqueFranchiseIds = [...new Set(franchiseIds)];

  await executor
    .delete(mediaItemFranchises)
    .where(eq(mediaItemFranchises.mediaItemId, mediaItemId));

  if (uniqueFranchiseIds.length === 0) {
    return;
  }

  await executor.insert(mediaItemFranchises).values(
    uniqueFranchiseIds.map((franchiseId) => ({
      mediaItemId,
      franchiseId,
    })),
  );
}

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

const currentAuthorRatedAtSql = (currentAuthorId?: number) =>
  currentAuthorId
    ? sql<Date | null>`(
        select ${ratings.createdAt}
        from ${ratings}
        where ${ratings.mediaItemId} = ${mediaItems.id}
          and ${ratings.authorId} = ${currentAuthorId}
        limit 1
      )`
    : sql<Date | null>`null`;

const currentAuthorFirstExperiencedAtSql = (currentAuthorId?: number) =>
  currentAuthorId
    ? sql<string | null>`(
        select ${authorMediaExperiences.firstExperiencedAt}
        from ${authorMediaExperiences}
        where ${authorMediaExperiences.mediaItemId} = ${mediaItems.id}
          and ${authorMediaExperiences.authorId} = ${currentAuthorId}
        limit 1
      )`
    : sql<string | null>`null`;

const currentAuthorFirstExperiencedPrecisionSql = (currentAuthorId?: number) =>
  currentAuthorId
    ? sql<"year" | "month" | "day" | null>`(
        select ${authorMediaExperiences.firstExperiencedPrecision}
        from ${authorMediaExperiences}
        where ${authorMediaExperiences.mediaItemId} = ${mediaItems.id}
          and ${authorMediaExperiences.authorId} = ${currentAuthorId}
        limit 1
      )`
    : sql<"year" | "month" | "day" | null>`null`;

const catalogSearchCondition = (searchQuery: string) => {
  const normalizedSearchQuery = searchQuery.trim().toLowerCase();

  if (!normalizedSearchQuery) {
    return undefined;
  }

  const pattern = `%${normalizedSearchQuery}%`;

  return or(
    sql`lower(${mediaItems.title}) like ${pattern}`,
    sql`lower(${mediaItems.originalTitle}) like ${pattern}`,
    sql`lower(${mediaItems.code}) like ${pattern}`,
  );
};

const currentAuthorRatingExistsCondition = (currentAuthorId: number) =>
  exists(
    db
      .select({ id: ratings.id })
      .from(ratings)
      .where(and(eq(ratings.mediaItemId, mediaItems.id), eq(ratings.authorId, currentAuthorId))),
  );

function catalogFilterConditions(input: {
  authorRatingFilter: AuthorRatingFilter;
  currentAuthorId?: number;
  mediaTypeFilter: MediaTypeFilter;
  searchQuery: string;
  yearFilter: CatalogYearFilter;
  yearMode: CatalogYearMode;
}) {
  const conditions: SQL[] = [publishedMediaItemCondition];
  const searchCondition = catalogSearchCondition(input.searchQuery);

  if (searchCondition) {
    conditions.push(searchCondition);
  }

  if (input.mediaTypeFilter !== "all") {
    conditions.push(eq(mediaItems.mediaType, input.mediaTypeFilter));
  }

  if (input.currentAuthorId && input.authorRatingFilter !== "all") {
    const ratingExistsCondition = currentAuthorRatingExistsCondition(input.currentAuthorId);

    conditions.push(
      input.authorRatingFilter === "rated"
        ? ratingExistsCondition
        : not(ratingExistsCondition),
    );
  }

  if (input.yearFilter !== null) {
    conditions.push(catalogYearCondition(input.yearFilter, input.yearMode, input.currentAuthorId));
  }

  return and(...conditions)!;
}

function catalogYearCondition(
  yearFilter: number,
  yearMode: CatalogYearMode,
  currentAuthorId?: number,
) {
  if (yearMode === "experience" && currentAuthorId) {
    return exists(
      db
        .select({ id: authorMediaExperiences.id })
        .from(authorMediaExperiences)
        .where(
          and(
            eq(authorMediaExperiences.mediaItemId, mediaItems.id),
            eq(authorMediaExperiences.authorId, currentAuthorId),
            sql`extract(year from ${authorMediaExperiences.firstExperiencedAt}) = ${yearFilter}`,
          ),
        ),
    );
  }

  if (yearMode === "rating" && currentAuthorId) {
    return exists(
      db
        .select({ id: ratings.id })
        .from(ratings)
        .where(
          and(
            eq(ratings.mediaItemId, mediaItems.id),
            eq(ratings.authorId, currentAuthorId),
            sql`extract(year from ${ratings.createdAt}) = ${yearFilter}`,
          ),
        ),
    );
  }

  return eq(mediaItems.releaseYear, yearFilter);
}

function catalogOrderBy(
  sort: CatalogSort,
  direction: CatalogSortDirection,
  currentAuthorId?: number,
) {
  const titleOrder = direction === "asc" ? asc(mediaItems.title) : desc(mediaItems.title);

  if (sort === "release_year") {
    return [
      direction === "asc"
        ? sql`${mediaItems.releaseYear} asc nulls last`
        : sql`${mediaItems.releaseYear} desc nulls last`,
      asc(mediaItems.title),
    ];
  }

  if (sort === "average_score") {
    return [
      direction === "asc"
        ? sql`avg(${ratings.score}) asc nulls last`
        : sql`avg(${ratings.score}) desc nulls last`,
      asc(mediaItems.title),
    ];
  }

  if (sort === "ratings_count") {
    return [
      direction === "asc" ? sql`count(${ratings.id}) asc` : sql`count(${ratings.id}) desc`,
      asc(mediaItems.title),
    ];
  }

  if (sort === "my_rating_score" && currentAuthorId) {
    return [
      direction === "asc"
        ? sql`${currentAuthorScoreSql(currentAuthorId)} asc nulls last`
        : sql`${currentAuthorScoreSql(currentAuthorId)} desc nulls last`,
      asc(mediaItems.title),
    ];
  }

  if (sort === "my_first_experience_year" && currentAuthorId) {
    return [
      direction === "asc"
        ? sql`${currentAuthorFirstExperiencedAtSql(currentAuthorId)} asc nulls last`
        : sql`${currentAuthorFirstExperiencedAtSql(currentAuthorId)} desc nulls last`,
      asc(mediaItems.title),
    ];
  }

  return [titleOrder];
}

const catalogMediaItemsQuery = (input: {
  authorRatingFilter: AuthorRatingFilter;
  currentAuthorId?: number;
  filterCondition: SQL;
  mediaTypeFilter: MediaTypeFilter;
  page: number;
  pageSize: number;
  searchQuery: string;
  sort: CatalogSort;
  sortDirection: CatalogSortDirection;
  yearFilter: CatalogYearFilter;
  yearMode: CatalogYearMode;
}) =>
  db
    .select({
      id: mediaItems.id,
      code: mediaItems.code,
      title: mediaItems.title,
      originalTitle: mediaItems.originalTitle,
      description: mediaItems.description,
      mediaType: mediaItems.mediaType,
      franchises: franchisesJsonSql(),
      mediaCarrierCode: mediaCarriers.code,
      mediaCarrierName: mediaCarriers.name,
      releaseYear: mediaItems.releaseYear,
      metadataFacts: mediaItemMetadata.facts,
      coverUrl: mediaItems.coverUrl,
      coverThumbUrl: mediaItems.coverThumbUrl,
      coverSourceProvider: mediaItems.coverSourceProvider,
      coverSourcePageUrl: mediaItems.coverSourcePageUrl,
      averageScore: sql<number | null>`avg(${ratings.score})::float`,
      ratingsCount: sql<number>`count(distinct ${ratings.id})::int`,
      currentAuthorScore: currentAuthorScoreSql(input.currentAuthorId),
      currentAuthorRatedAt: currentAuthorRatedAtSql(input.currentAuthorId),
      currentAuthorFirstExperiencedAt: currentAuthorFirstExperiencedAtSql(
        input.currentAuthorId,
      ),
      currentAuthorFirstExperiencedPrecision: currentAuthorFirstExperiencedPrecisionSql(
        input.currentAuthorId,
      ),
    })
    .from(mediaItems)
    .leftJoin(mediaCarriers, eq(mediaCarriers.id, mediaItems.mediaCarrierId))
    .leftJoin(mediaItemMetadata, eq(mediaItemMetadata.mediaItemId, mediaItems.id))
    .leftJoin(ratings, eq(ratings.mediaItemId, mediaItems.id))
    .where(input.filterCondition)
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
      mediaItemMetadata.facts,
      mediaItems.coverUrl,
      mediaItems.coverThumbUrl,
      mediaItems.coverSourceProvider,
      mediaItems.coverSourcePageUrl,
    )
    .orderBy(...catalogOrderBy(input.sort, input.sortDirection, input.currentAuthorId))
    .limit(input.pageSize)
    .offset(getOffset(input.page, input.pageSize));

export type CatalogMediaItem = Awaited<
  ReturnType<typeof getCatalogMediaItems>
>["items"][number];

export async function getCatalogMediaItems(input: {
  authorRatingFilter: AuthorRatingFilter;
  currentAuthorId?: number;
  mediaTypeFilter: MediaTypeFilter;
  page: number;
  pageSize: number;
  searchQuery: string;
  sort: CatalogSort;
  sortDirection: CatalogSortDirection;
  yearFilter: CatalogYearFilter;
  yearMode: CatalogYearMode;
}) {
  const filterCondition = catalogFilterConditions(input);
  const [{ totalCount }] = await db
    .select({ totalCount: sql<number>`count(*)::int` })
    .from(mediaItems)
    .where(filterCondition);
  const totalPages = getTotalPages(totalCount, input.pageSize);
  const page = clampPage(input.page, totalPages);
  const items = await catalogMediaItemsQuery({ ...input, filterCondition, page });

  return {
    items: items.map((item) => ({
      ...withResolvedFranchises(item),
      coverUrl: resolveCoverUrl(item.coverUrl),
      coverThumbUrl: resolveCoverUrl(item.coverThumbUrl),
    })),
    page,
    pageSize: input.pageSize,
    totalCount,
    totalPages,
  };
}

export async function getCatalogMediaTypeCounts(input: {
  authorRatingFilter: AuthorRatingFilter;
  currentAuthorId?: number;
  searchQuery: string;
  yearFilter: CatalogYearFilter;
  yearMode: CatalogYearMode;
}) {
  const filterCondition = catalogFilterConditions({
    ...input,
    mediaTypeFilter: "all",
  });

  return db
    .select({
      mediaType: mediaItems.mediaType,
      count: sql<number>`count(*)::int`,
    })
    .from(mediaItems)
    .where(filterCondition)
    .groupBy(mediaItems.mediaType);
}

export async function getCatalogReleaseYearBounds() {
  const [bounds] = await db
    .select({
      minReleaseYear: sql<number | null>`min(${mediaItems.releaseYear})::int`,
    })
    .from(mediaItems)
    .where(publishedMediaItemCondition);

  return {
    minReleaseYear: bounds?.minReleaseYear ?? null,
  };
}

export async function getAuthorMediaItems(authorId: number) {
  return db
    .select({
      id: mediaItems.id,
      code: mediaItems.code,
      title: mediaItems.title,
      originalTitle: mediaItems.originalTitle,
      mediaType: mediaItems.mediaType,
      mediaCarrierCode: mediaCarriers.code,
      mediaCarrierName: mediaCarriers.name,
      releaseYear: mediaItems.releaseYear,
      coverUrl: mediaItems.coverUrl,
      coverThumbUrl: mediaItems.coverThumbUrl,
      coverSourceProvider: mediaItems.coverSourceProvider,
      coverSourceExternalId: mediaItems.coverSourceExternalId,
      coverSourcePageUrl: mediaItems.coverSourcePageUrl,
      publicationStatus: mediaItems.publicationStatus,
      adminNote: mediaItems.adminNote,
      updatedAt: mediaItems.updatedAt,
    })
    .from(mediaItems)
    .leftJoin(mediaCarriers, eq(mediaCarriers.id, mediaItems.mediaCarrierId))
    .where(
      and(
        eq(mediaItems.createdByAuthorId, authorId),
        ne(mediaItems.publicationStatus, PUBLISHED_PUBLICATION_STATUS),
      ),
    )
    .orderBy(asc(mediaItems.title));
}

function adminMediaFilterConditions(input: {
  authorId?: number;
  mediaCarrierId?: number;
  mediaTypeFilter: MediaTypeFilter;
  searchQuery: string;
}) {
  const conditions: SQL[] = [];
  const searchCondition = catalogSearchCondition(input.searchQuery);

  if (searchCondition) {
    conditions.push(searchCondition);
  }

  if (input.mediaTypeFilter !== "all") {
    conditions.push(eq(mediaItems.mediaType, input.mediaTypeFilter));
  }

  if (input.mediaCarrierId) {
    conditions.push(eq(mediaItems.mediaCarrierId, input.mediaCarrierId));
  }

  if (input.authorId) {
    conditions.push(eq(mediaItems.createdByAuthorId, input.authorId));
  }

  return conditions.length > 0 ? and(...conditions) : undefined;
}

export async function getAdminMediaItems(input: {
  authorId?: number;
  mediaCarrierId?: number;
  mediaTypeFilter: MediaTypeFilter;
  page: number;
  pageSize: number;
  searchQuery: string;
  sort: CatalogSort;
  sortDirection?: CatalogSortDirection;
}) {
  const filterCondition = adminMediaFilterConditions(input);
  const [{ totalCount }] = await db
    .select({ totalCount: sql<number>`count(*)::int` })
    .from(mediaItems)
    .where(filterCondition);
  const totalPages = getTotalPages(totalCount, input.pageSize);
  const page = clampPage(input.page, totalPages);
  const items = await db
    .select({
      id: mediaItems.id,
      code: mediaItems.code,
      title: mediaItems.title,
      originalTitle: mediaItems.originalTitle,
      description: mediaItems.description,
      mediaType: mediaItems.mediaType,
      franchises: franchisesJsonSql(),
      mediaCarrierCode: mediaCarriers.code,
      mediaCarrierName: mediaCarriers.name,
      releaseYear: mediaItems.releaseYear,
      coverUrl: mediaItems.coverUrl,
      coverThumbUrl: mediaItems.coverThumbUrl,
      publicationStatus: mediaItems.publicationStatus,
      createdByAuthorId: mediaItems.createdByAuthorId,
      authorName: authors.name,
      authorCode: authors.code,
      averageScore: sql<number | null>`avg(${ratings.score})::float`,
      ratingsCount: sql<number>`count(${ratings.id})::int`,
      currentAuthorScore: sql<number | null>`null`,
    })
    .from(mediaItems)
    .leftJoin(mediaCarriers, eq(mediaCarriers.id, mediaItems.mediaCarrierId))
    .leftJoin(authors, eq(authors.id, mediaItems.createdByAuthorId))
    .leftJoin(ratings, eq(ratings.mediaItemId, mediaItems.id))
    .where(filterCondition)
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
      mediaItems.publicationStatus,
      mediaItems.createdByAuthorId,
      authors.name,
      authors.code,
    )
    .orderBy(
      ...catalogOrderBy(
        input.sort,
        input.sortDirection ?? DEFAULT_CATALOG_SORT_DIRECTIONS[input.sort],
      ),
    )
    .limit(input.pageSize)
    .offset(getOffset(page, input.pageSize));

  return {
    items: items.map((item) => ({
      ...withResolvedFranchises(item),
      coverUrl: resolveCoverUrl(item.coverUrl),
      coverThumbUrl: resolveCoverUrl(item.coverThumbUrl),
    })),
    page,
    pageSize: input.pageSize,
    totalCount,
    totalPages,
  };
}

export async function getAdminMediaTypeCounts(input?: { authorId?: number }) {
  return db
    .select({
      mediaType: mediaItems.mediaType,
      count: sql<number>`count(*)::int`,
    })
    .from(mediaItems)
    .where(input?.authorId ? eq(mediaItems.createdByAuthorId, input.authorId) : undefined)
    .groupBy(mediaItems.mediaType);
}

type MediaItemLimitUsageExecutor = Pick<typeof db, "select"> | Pick<DbTransaction, "select">;

export async function getAuthorPrivateMediaItemLimitUsageForExecutor(
  executor: MediaItemLimitUsageExecutor,
  input: {
    authorId: number;
    since: Date;
  },
) {
  const privateMediaItemCondition = eq(mediaItems.publicationStatus, "private");

  const [usage] = await executor
    .select({
      totalCount: sql<number>`count(*) filter (where ${privateMediaItemCondition})::int`,
      recentCount: sql<number>`count(*) filter (where ${and(
        privateMediaItemCondition,
        gte(mediaItems.createdAt, input.since),
      )})::int`,
    })
    .from(mediaItems)
    .where(eq(mediaItems.createdByAuthorId, input.authorId));

  return {
    totalCount: usage?.totalCount ?? 0,
    recentCount: usage?.recentCount ?? 0,
  };
}

export async function getAuthorPrivateMediaItemLimitUsage(input: {
  authorId: number;
  since: Date;
}) {
  return getAuthorPrivateMediaItemLimitUsageForExecutor(db, input);
}

function mediaItemDuplicateSearchCondition(input: MediaItemDuplicateCheckInput) {
  const searchTerms = [input.title, input.originalTitle]
    .map((value) => value?.trim().toLowerCase() ?? "")
    .filter((value) => value.length >= 2);

  if (searchTerms.length === 0) {
    return undefined;
  }

  return or(
    ...searchTerms.flatMap((searchTerm) => {
      const pattern = `%${searchTerm}%`;

      return [
        sql`lower(${mediaItems.title}) like ${pattern}`,
        sql`lower(${mediaItems.originalTitle}) like ${pattern}`,
        sql`lower(${mediaItems.code}) like ${pattern}`,
      ];
    }),
  );
}

export async function findPublishedMediaItemDuplicateCandidates(
  input: MediaItemDuplicateCheckInput,
): Promise<MediaItemDuplicateMatch[]> {
  const searchCondition = mediaItemDuplicateSearchCondition(input);

  if (!searchCondition) {
    return [];
  }

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
        publishedMediaItemCondition,
        eq(mediaItems.mediaType, input.mediaType),
        searchCondition,
      ),
    )
    .orderBy(asc(mediaItems.title), asc(mediaItems.code))
    .limit(10);
}

export type AuthorMediaItemInput = {
  authorId: number;
  code: string;
  title: string;
  originalTitle: string | null;
  description: string | null;
  mediaType: MediaType;
  franchiseIds: number[];
  mediaCarrierId: number | null;
  releaseYear: number | null;
  coverUrl: string | null;
  coverThumbUrl: string | null;
  coverSource: CoverSourceInput;
};

export async function createAuthorMediaItem(input: AuthorMediaItemInput) {
  await db.transaction(async (tx) => {
    const [item] = await tx
      .insert(mediaItems)
      .values({
        code: input.code,
        title: input.title,
        originalTitle: input.originalTitle,
        description: input.description,
        mediaType: input.mediaType,
        mediaCarrierId: input.mediaCarrierId,
        releaseYear: input.releaseYear,
        coverUrl: input.coverUrl,
        coverThumbUrl: input.coverThumbUrl,
        coverSourceProvider: input.coverSource.provider,
        coverSourceExternalId: input.coverSource.externalId,
        coverSourcePageUrl: input.coverSource.pageUrl,
        createdByAuthorId: input.authorId,
        publicationStatus: "private",
      })
      .returning({ id: mediaItems.id });

    await setMediaItemFranchisesForExecutor(tx, item.id, input.franchiseIds);
  });
}

export async function createAdminMediaItem(input: Omit<AuthorMediaItemInput, "authorId"> & {
  authorId: number;
}) {
  return db.transaction(async (tx) => {
    const [item] = await tx
      .insert(mediaItems)
      .values({
        code: input.code,
        title: input.title,
        originalTitle: input.originalTitle,
        description: input.description,
        mediaType: input.mediaType,
        mediaCarrierId: input.mediaCarrierId,
        releaseYear: input.releaseYear,
        coverUrl: input.coverUrl,
        coverThumbUrl: input.coverThumbUrl,
        coverSourceProvider: input.coverSource.provider,
        coverSourceExternalId: input.coverSource.externalId,
        coverSourcePageUrl: input.coverSource.pageUrl,
        createdByAuthorId: input.authorId,
        publicationStatus: "published",
      })
      .returning({
        id: mediaItems.id,
        code: mediaItems.code,
        coverUrl: mediaItems.coverUrl,
        coverThumbUrl: mediaItems.coverThumbUrl,
      });

    await setMediaItemFranchisesForExecutor(tx, item.id, input.franchiseIds);

    return item;
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
      franchiseIds: franchiseIdsSql(),
      mediaCarrierId: mediaItems.mediaCarrierId,
      releaseYear: mediaItems.releaseYear,
      coverUrl: mediaItems.coverUrl,
      coverThumbUrl: mediaItems.coverThumbUrl,
      coverSourceProvider: mediaItems.coverSourceProvider,
      coverSourceExternalId: mediaItems.coverSourceExternalId,
      coverSourcePageUrl: mediaItems.coverSourcePageUrl,
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
      franchiseIds: franchiseIdsSql(),
      mediaCarrierId: mediaItems.mediaCarrierId,
      releaseYear: mediaItems.releaseYear,
      coverUrl: mediaItems.coverUrl,
      coverThumbUrl: mediaItems.coverThumbUrl,
      coverSourceProvider: mediaItems.coverSourceProvider,
      coverSourceExternalId: mediaItems.coverSourceExternalId,
      coverSourcePageUrl: mediaItems.coverSourcePageUrl,
      publicationStatus: mediaItems.publicationStatus,
      adminNote: mediaItems.adminNote,
      createdByAuthorId: mediaItems.createdByAuthorId,
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
        coverThumbUrl: resolveCoverUrl(item.coverThumbUrl),
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
      franchises: franchisesJsonSql(),
      mediaCarrierId: mediaItems.mediaCarrierId,
      mediaCarrierCode: mediaCarriers.code,
      mediaCarrierName: mediaCarriers.name,
      releaseYear: mediaItems.releaseYear,
      coverUrl: mediaItems.coverUrl,
      coverThumbUrl: mediaItems.coverThumbUrl,
      publicationStatus: mediaItems.publicationStatus,
      adminNote: mediaItems.adminNote,
      averageScore: sql<number | null>`avg(${ratings.score})::float`,
      ratingsCount: sql<number>`count(${ratings.id})::int`,
      currentAuthorScore: currentAuthorScoreSql(authorId),
      currentAuthorFirstExperiencedAt: currentAuthorFirstExperiencedAtSql(authorId),
      currentAuthorFirstExperiencedPrecision: currentAuthorFirstExperiencedPrecisionSql(authorId),
    })
    .from(mediaItems)
    .leftJoin(mediaCarriers, eq(mediaCarriers.id, mediaItems.mediaCarrierId))
    .leftJoin(ratings, eq(ratings.mediaItemId, mediaItems.id))
    .where(and(eq(mediaItems.id, mediaItemId), eq(mediaItems.createdByAuthorId, authorId)))
    .groupBy(
      mediaItems.id,
      mediaItems.code,
      mediaItems.title,
      mediaItems.originalTitle,
      mediaItems.description,
      mediaItems.mediaType,
      mediaItems.mediaCarrierId,
      mediaCarriers.code,
      mediaCarriers.name,
      mediaItems.releaseYear,
      mediaItems.coverUrl,
      mediaItems.coverThumbUrl,
      mediaItems.publicationStatus,
      mediaItems.adminNote,
    )
    .limit(1);

  return item
    ? {
        ...withResolvedFranchises(item),
        coverUrl: resolveCoverUrl(item.coverUrl),
        coverThumbUrl: resolveCoverUrl(item.coverThumbUrl),
      }
    : null;
}

export async function updateAuthorMediaItem(input: Omit<AuthorMediaItemInput, "code"> & {
  mediaItemId: number;
}) {
  await db.transaction(async (tx) => {
    await tx
      .update(mediaItems)
      .set({
        title: input.title,
        originalTitle: input.originalTitle,
        description: input.description,
        mediaType: input.mediaType,
        mediaCarrierId: input.mediaCarrierId,
        releaseYear: input.releaseYear,
        coverUrl: input.coverUrl,
        coverThumbUrl: input.coverThumbUrl,
        coverSourceProvider: input.coverSource.provider,
        coverSourceExternalId: input.coverSource.externalId,
        coverSourcePageUrl: input.coverSource.pageUrl,
        updatedAt: new Date(),
      })
      .where(
        and(
          eq(mediaItems.id, input.mediaItemId),
          eq(mediaItems.createdByAuthorId, input.authorId),
          not(publishedMediaItemCondition),
        ),
      );

    await setMediaItemFranchisesForExecutor(tx, input.mediaItemId, input.franchiseIds);
  });
}

export async function updateAdminMediaItem(input: Omit<AuthorMediaItemInput, "authorId" | "code"> & {
  mediaItemId: number;
  authorId: number | null;
}) {
  return db.transaction(async (tx) => {
    const [item] = await tx
      .update(mediaItems)
      .set({
        title: input.title,
        originalTitle: input.originalTitle,
        description: input.description,
        mediaType: input.mediaType,
        mediaCarrierId: input.mediaCarrierId,
        releaseYear: input.releaseYear,
        coverUrl: input.coverUrl,
        coverThumbUrl: input.coverThumbUrl,
        coverSourceProvider: input.coverSource.provider,
        coverSourceExternalId: input.coverSource.externalId,
        coverSourcePageUrl: input.coverSource.pageUrl,
        createdByAuthorId: input.authorId,
        updatedAt: new Date(),
      })
      .where(eq(mediaItems.id, input.mediaItemId))
      .returning({
        id: mediaItems.id,
        code: mediaItems.code,
      });

    if (!item) {
      return null;
    }

    await setMediaItemFranchisesForExecutor(tx, input.mediaItemId, input.franchiseIds);

    return item;
  });
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

export async function withdrawAuthorMediaItemFromReview(input: {
  authorId: number;
  mediaItemId: number;
}) {
  const now = new Date();
  const [item] = await db
    .update(mediaItems)
    .set({
      publicationStatus: "private",
      submittedAt: null,
      reviewedByAdminId: null,
      reviewedAt: null,
      updatedAt: now,
    })
    .where(
      and(
        eq(mediaItems.id, input.mediaItemId),
        eq(mediaItems.createdByAuthorId, input.authorId),
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

export async function deleteAuthorDraftMediaItem(input: {
  authorId: number;
  mediaItemId: number;
}) {
  return db.transaction(async (tx) => {
    const [item] = await tx
      .select({
        id: mediaItems.id,
        code: mediaItems.code,
        coverUrl: mediaItems.coverUrl,
        coverThumbUrl: mediaItems.coverThumbUrl,
        publicationStatus: mediaItems.publicationStatus,
      })
      .from(mediaItems)
      .where(
        and(
          eq(mediaItems.id, input.mediaItemId),
          eq(mediaItems.createdByAuthorId, input.authorId),
          inArray(mediaItems.publicationStatus, ["private", "rejected"]),
        ),
      )
      .limit(1);

    if (!item) {
      return null;
    }

    await tx
      .delete(authorMediaExperiences)
      .where(eq(authorMediaExperiences.mediaItemId, input.mediaItemId));
    await tx.delete(ratings).where(eq(ratings.mediaItemId, input.mediaItemId));
    await tx.delete(mediaItems).where(eq(mediaItems.id, input.mediaItemId));

    return item;
  });
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
      franchises: franchisesJsonSql(),
      releaseYear: mediaItems.releaseYear,
      coverUrl: mediaItems.coverUrl,
      coverThumbUrl: mediaItems.coverThumbUrl,
      submittedAt: mediaItems.submittedAt,
      updatedAt: mediaItems.updatedAt,
      authorId: authors.id,
      authorName: authors.name,
      authorCode: authors.code,
    })
    .from(mediaItems)
    .innerJoin(authors, eq(authors.id, mediaItems.createdByAuthorId))
    .where(eq(mediaItems.publicationStatus, "submitted"))
    .orderBy(desc(mediaItems.submittedAt), desc(mediaItems.updatedAt));

  return items.map((item) => ({
    ...withResolvedFranchises(item),
    coverUrl: resolveCoverUrl(item.coverUrl),
    coverThumbUrl: resolveCoverUrl(item.coverThumbUrl),
  }));
}

export async function getSubmittedAuthorMediaItemsCountForAdmin() {
  const [result] = await db
    .select({ count: sql<number>`count(*)::int` })
    .from(mediaItems)
    .where(eq(mediaItems.publicationStatus, "submitted"));

  return result?.count ?? 0;
}

export async function getAdminMediaItemIdentityById(mediaItemId: number) {
  const [item] = await db
    .select({
      id: mediaItems.id,
      code: mediaItems.code,
      title: mediaItems.title,
      mediaType: mediaItems.mediaType,
      franchises: franchisesJsonSql(),
      createdByAuthorId: mediaItems.createdByAuthorId,
      publicationStatus: mediaItems.publicationStatus,
      coverUrl: mediaItems.coverUrl,
      coverThumbUrl: mediaItems.coverThumbUrl,
      coverSourceProvider: mediaItems.coverSourceProvider,
      coverSourceExternalId: mediaItems.coverSourceExternalId,
      coverSourcePageUrl: mediaItems.coverSourcePageUrl,
    })
    .from(mediaItems)
    .where(eq(mediaItems.id, mediaItemId))
    .limit(1);

  return item ? withResolvedFranchises(item) : null;
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
      franchises: franchisesJsonSql(),
      mediaCarrierCode: mediaCarriers.code,
      mediaCarrierName: mediaCarriers.name,
      releaseYear: mediaItems.releaseYear,
      coverUrl: mediaItems.coverUrl,
      coverThumbUrl: mediaItems.coverThumbUrl,
      submittedAt: mediaItems.submittedAt,
      authorName: authors.name,
      authorCode: authors.code,
      averageScore: sql<number | null>`avg(${ratings.score})::float`,
      ratingsCount: sql<number>`count(${ratings.id})::int`,
    })
    .from(mediaItems)
    .innerJoin(authors, eq(authors.id, mediaItems.createdByAuthorId))
    .leftJoin(mediaCarriers, eq(mediaCarriers.id, mediaItems.mediaCarrierId))
    .leftJoin(ratings, eq(ratings.mediaItemId, mediaItems.id))
    .where(and(eq(mediaItems.id, mediaItemId), eq(mediaItems.publicationStatus, "submitted")))
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
      mediaItems.submittedAt,
      authors.name,
      authors.code,
    )
    .limit(1);

  return item
    ? {
        ...withResolvedFranchises(item),
        coverUrl: resolveCoverUrl(item.coverUrl),
        coverThumbUrl: resolveCoverUrl(item.coverThumbUrl),
      }
    : null;
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
      title: mediaItems.title,
      publicationStatus: mediaItems.publicationStatus,
    });

  return item ?? null;
}

export async function updateAdminMediaItemPublicationStatus(input: {
  mediaItemId: number;
  nextStatus: Extract<PublicationStatus, "private" | "published">;
}) {
  const now = new Date();
  const [item] = await db
    .update(mediaItems)
    .set({
      publicationStatus: input.nextStatus,
      submittedAt: null,
      reviewedAt: input.nextStatus === "published" ? now : null,
      reviewedByAdminId: null,
      adminNote: null,
      updatedAt: now,
    })
    .where(eq(mediaItems.id, input.mediaItemId))
    .returning({
      id: mediaItems.id,
      code: mediaItems.code,
      title: mediaItems.title,
      franchises: franchisesJsonSql(),
      createdByAuthorId: mediaItems.createdByAuthorId,
      publicationStatus: mediaItems.publicationStatus,
      coverUrl: mediaItems.coverUrl,
      coverThumbUrl: mediaItems.coverThumbUrl,
      coverSourceProvider: mediaItems.coverSourceProvider,
      coverSourceExternalId: mediaItems.coverSourceExternalId,
      coverSourcePageUrl: mediaItems.coverSourcePageUrl,
    });

  return item ? withResolvedFranchises(item) : null;
}

export async function deleteAdminUnpublishedMediaItemWithRelatedData(mediaItemId: number) {
  return db.transaction(async (tx) => {
    const [item] = await tx
      .select({
        id: mediaItems.id,
        code: mediaItems.code,
        title: mediaItems.title,
        publicationStatus: mediaItems.publicationStatus,
      })
      .from(mediaItems)
      .where(
        and(
          eq(mediaItems.id, mediaItemId),
          ne(mediaItems.publicationStatus, PUBLISHED_PUBLICATION_STATUS),
        ),
      )
      .limit(1);

    if (!item) {
      return null;
    }

    await tx
      .delete(contributionMediaItems)
      .where(eq(contributionMediaItems.mediaItemId, mediaItemId));
    await tx.delete(contributions).where(eq(contributions.primaryMediaItemId, mediaItemId));
    await tx
      .delete(authorMediaExperiences)
      .where(eq(authorMediaExperiences.mediaItemId, mediaItemId));
    await tx.delete(ratings).where(eq(ratings.mediaItemId, mediaItemId));
    await tx.delete(mediaItems).where(eq(mediaItems.id, mediaItemId));

    return item;
  });
}

export async function canViewMediaItemCover(
  objectKey: string,
  currentAuthor?: { id: number; code: string },
) {
  const authorOwnsCoverCondition = currentAuthor
    ? and(
        eq(mediaItems.createdByAuthorId, currentAuthor.id),
        exists(
          db
            .select({ id: authors.id })
            .from(authors)
            .where(
              and(
                eq(authors.id, currentAuthor.id),
                eq(authors.code, currentAuthor.code),
                isNull(authors.blockedAt),
              ),
            ),
        ),
      )
    : undefined;
  const visibilityCondition = authorOwnsCoverCondition
    ? or(publishedMediaItemCondition, authorOwnsCoverCondition)
    : publishedMediaItemCondition;
  const [item] = await db
    .select({ id: mediaItems.id })
    .from(mediaItems)
    .where(
      and(
        or(eq(mediaItems.coverUrl, objectKey), eq(mediaItems.coverThumbUrl, objectKey)),
        visibilityCondition,
      ),
    )
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

export async function getPublicMediaItemMetadataByCode(code: string) {
  const [item] = await db
    .select({
      title: mediaItems.title,
      description: mediaItems.description,
      coverUrl: mediaItems.coverUrl,
    })
    .from(mediaItems)
    .where(and(eq(mediaItems.code, code), publishedMediaItemCondition))
    .limit(1);

  return item
    ? {
        ...item,
        coverUrl: resolveCoverUrl(item.coverUrl),
      }
    : null;
}

export async function getMediaItemIdentityForAuthorRating(code: string, authorId: number) {
  const [item] = await db
    .select({
      id: mediaItems.id,
      code: mediaItems.code,
      franchises: franchisesJsonSql(),
      releaseYear: mediaItems.releaseYear,
    })
    .from(mediaItems)
    .where(
      and(
        eq(mediaItems.code, code),
        or(publishedMediaItemCondition, eq(mediaItems.createdByAuthorId, authorId)),
      ),
    )
    .limit(1);

  return item ? withResolvedFranchises(item) : null;
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
      franchises: franchisesJsonSql(),
      mediaCarrierCode: mediaCarriers.code,
      mediaCarrierName: mediaCarriers.name,
      releaseYear: mediaItems.releaseYear,
      metadataFacts: mediaItemMetadata.facts,
      coverUrl: mediaItems.coverUrl,
      coverThumbUrl: mediaItems.coverThumbUrl,
      coverSourceProvider: mediaItems.coverSourceProvider,
      coverSourcePageUrl: mediaItems.coverSourcePageUrl,
      averageScore: sql<number | null>`avg(${ratings.score})::float`,
      ratingsCount: sql<number>`count(${ratings.id})::int`,
      currentAuthorScore: currentAuthorScoreSql(currentAuthorId),
      currentAuthorFirstExperiencedAt: currentAuthorFirstExperiencedAtSql(currentAuthorId),
      currentAuthorFirstExperiencedPrecision: currentAuthorFirstExperiencedPrecisionSql(
        currentAuthorId,
      ),
    })
    .from(mediaItems)
    .leftJoin(mediaCarriers, eq(mediaCarriers.id, mediaItems.mediaCarrierId))
    .leftJoin(mediaItemMetadata, eq(mediaItemMetadata.mediaItemId, mediaItems.id))
    .leftJoin(ratings, eq(ratings.mediaItemId, mediaItems.id))
    .where(and(eq(mediaItems.code, code), publishedMediaItemCondition))
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
      mediaItemMetadata.facts,
      mediaItems.coverUrl,
      mediaItems.coverThumbUrl,
      mediaItems.coverSourceProvider,
      mediaItems.coverSourcePageUrl,
    )
    .limit(1);

  return item
    ? {
        ...withResolvedFranchises(item),
        coverUrl: resolveCoverUrl(item.coverUrl),
        coverThumbUrl: resolveCoverUrl(item.coverThumbUrl),
      }
    : null;
}

export async function getOtherMediaItemsFromFranchises(
  franchiseIds: number[],
  currentMediaItemId: number,
  currentAuthorId?: number,
) {
  if (franchiseIds.length === 0) {
    return [];
  }

  const items = await db
    .select({
      id: mediaItems.id,
      code: mediaItems.code,
      title: mediaItems.title,
      originalTitle: mediaItems.originalTitle,
      mediaType: mediaItems.mediaType,
      mediaCarrierCode: mediaCarriers.code,
      mediaCarrierName: mediaCarriers.name,
      releaseYear: mediaItems.releaseYear,
      coverUrl: mediaItems.coverUrl,
      coverThumbUrl: mediaItems.coverThumbUrl,
      averageScore: sql<number | null>`avg(${ratings.score})::float`,
      ratingsCount: sql<number>`count(distinct ${ratings.id})::int`,
      currentAuthorScore: currentAuthorScoreSql(currentAuthorId),
    })
    .from(mediaItems)
    .innerJoin(mediaItemFranchises, eq(mediaItemFranchises.mediaItemId, mediaItems.id))
    .leftJoin(mediaCarriers, eq(mediaCarriers.id, mediaItems.mediaCarrierId))
    .leftJoin(ratings, eq(ratings.mediaItemId, mediaItems.id))
    .where(
      and(
        inArray(mediaItemFranchises.franchiseId, franchiseIds),
        ne(mediaItems.id, currentMediaItemId),
        publishedMediaItemCondition,
      ),
    )
    .groupBy(
      mediaItems.id,
      mediaItems.code,
      mediaItems.title,
      mediaItems.originalTitle,
      mediaItems.mediaType,
      mediaCarriers.code,
      mediaCarriers.name,
      mediaItems.releaseYear,
      mediaItems.coverUrl,
      mediaItems.coverThumbUrl,
    )
    .orderBy(sql`random()`)
    .limit(4);

  return items.map((item) => ({
    ...item,
    coverUrl: resolveCoverUrl(item.coverUrl),
    coverThumbUrl: resolveCoverUrl(item.coverThumbUrl),
  }));
}
