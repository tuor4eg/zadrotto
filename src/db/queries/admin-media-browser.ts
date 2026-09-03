import {
  and,
  asc,
  desc,
  eq,
  exists,
  inArray,
  or,
  sql,
  type SQL,
} from "drizzle-orm";

import { db } from "@/db";
import {
  mediaItemAverageScoreSql,
  mediaItemRatingsCountSql,
} from "@/db/queries/media-item-rating-stats";
import { containsNormalizedSearchSql, normalizeSearchSql } from "@/db/search";
import {
  franchises,
  mediaCarriers,
  mediaItemFranchises,
  mediaItemMetadata,
  mediaItemRatingStats,
  mediaItems,
  mediaItemTitleAliases,
  mediaTypes,
} from "@/db/schema";
import {
  type AdminMediaBrowserQuery,
  type AdminMediaBrowserSeriesOption,
} from "@/lib/admin/media-browser";
import { clampPage, getOffset, getTotalPages } from "@/lib/common/pagination";
import { PUBLISHED_PUBLICATION_STATUS } from "@/lib/media/publication-status";
import { normalizeSearchText } from "@/lib/search/normalize";
import { resolveCoverUrl } from "@/lib/services/minio";

const publishedMediaItemCondition = eq(
  mediaItems.publicationStatus,
  PUBLISHED_PUBLICATION_STATUS,
);

function mediaItemSearchCondition(searchQuery: string) {
  const normalizedSearchQuery = normalizeSearchText(searchQuery);

  if (!normalizedSearchQuery) {
    return null;
  }

  const codePattern = `%-${normalizedSearchQuery.replace(/\s+/g, "-")}-%`;

  return or(
    containsNormalizedSearchSql(mediaItems.title, normalizedSearchQuery),
    containsNormalizedSearchSql(mediaItems.originalTitle, normalizedSearchQuery),
    sql`('-' || ${normalizeSearchSql(mediaItems.code)} || '-') like ${codePattern}`,
    exists(
      db
        .select({ id: mediaItemTitleAliases.id })
        .from(mediaItemTitleAliases)
        .where(
          and(
            eq(mediaItemTitleAliases.mediaItemId, mediaItems.id),
            containsNormalizedSearchSql(mediaItemTitleAliases.value, normalizedSearchQuery),
          ),
        ),
    ),
  );
}

function franchiseFilterCondition(input: AdminMediaBrowserQuery) {
  if (!input.franchiseId) {
    return null;
  }

  const franchiseIds = input.seriesScope === "descendants"
    ? sql`(
        with recursive selected_franchise_branch as (
          select id
          from franchises
          where id = ${input.franchiseId}
            and publication_status = ${PUBLISHED_PUBLICATION_STATUS}

          union all

          select child.id
          from franchises child
          inner join selected_franchise_branch parent on child.parent_id = parent.id
          where child.publication_status = ${PUBLISHED_PUBLICATION_STATUS}
        )
        select id from selected_franchise_branch
      )`
    : sql`(${input.franchiseId})`;

  return sql`exists (
    select 1
    from media_item_franchises browser_link
    inner join franchises browser_franchise on browser_franchise.id = browser_link.franchise_id
    where browser_link.media_item_id = ${mediaItems.id}
      and browser_link.franchise_id in ${franchiseIds}
      and browser_link.publication_status = ${PUBLISHED_PUBLICATION_STATUS}
      and browser_franchise.publication_status = ${PUBLISHED_PUBLICATION_STATUS}
  )`;
}

function buildFilterCondition(input: AdminMediaBrowserQuery) {
  const conditions: SQL[] = [
    publishedMediaItemCondition,
    eq(mediaTypes.isPubliclyAvailable, true),
  ];
  const searchCondition = mediaItemSearchCondition(input.searchQuery);
  const selectedFranchiseCondition = franchiseFilterCondition(input);

  if (searchCondition) {
    conditions.push(searchCondition);
  }

  if (input.mediaType) {
    conditions.push(eq(mediaItems.mediaType, input.mediaType));
  }

  if (selectedFranchiseCondition) {
    conditions.push(selectedFranchiseCondition);
  }

  if (input.minAverageScore !== null) {
    conditions.push(
      sql`${mediaItemAverageScoreSql} >= ${input.minAverageScore * 10}`,
    );
  }

  return and(...conditions)!;
}

function getOrderBy(input: AdminMediaBrowserQuery) {
  const ascending = input.direction === "asc";

  if (input.sort === "average_score") {
    return [
      ascending
        ? sql`${mediaItemAverageScoreSql} asc nulls last`
        : sql`${mediaItemAverageScoreSql} desc nulls last`,
      asc(mediaItems.title),
      asc(mediaItems.id),
    ];
  }

  if (input.sort === "ratings_count") {
    return [
      ascending ? asc(mediaItemRatingsCountSql) : desc(mediaItemRatingsCountSql),
      asc(mediaItems.title),
      asc(mediaItems.id),
    ];
  }

  if (input.sort === "release_year") {
    return [
      ascending
        ? sql`${mediaItems.releaseYear} asc nulls last`
        : sql`${mediaItems.releaseYear} desc nulls last`,
      asc(mediaItems.title),
      asc(mediaItems.id),
    ];
  }

  return [
    ascending ? asc(mediaItems.title) : desc(mediaItems.title),
    asc(mediaItems.id),
  ];
}

export async function searchAdminMediaBrowser(input: AdminMediaBrowserQuery) {
  const filterCondition = buildFilterCondition(input);
  const [{ totalCount }] = await db
    .select({ totalCount: sql<number>`count(*)::int` })
    .from(mediaItems)
    .innerJoin(mediaTypes, eq(mediaTypes.code, mediaItems.mediaType))
    .leftJoin(mediaItemRatingStats, eq(mediaItemRatingStats.mediaItemId, mediaItems.id))
    .where(filterCondition);
  const totalPages = getTotalPages(totalCount, input.pageSize);
  const page = clampPage(input.page, totalPages);
  const idRows = await db
    .select({ id: mediaItems.id })
    .from(mediaItems)
    .innerJoin(mediaTypes, eq(mediaTypes.code, mediaItems.mediaType))
    .leftJoin(mediaItemRatingStats, eq(mediaItemRatingStats.mediaItemId, mediaItems.id))
    .where(filterCondition)
    .orderBy(...getOrderBy(input))
    .limit(input.pageSize)
    .offset(getOffset(page, input.pageSize));
  const orderedIds = idRows.map(({ id }) => id);

  if (orderedIds.length === 0) {
    return {
      items: [],
      page,
      pageSize: input.pageSize,
      totalCount,
      totalPages,
    };
  }

  const [itemRows, franchiseRows] = await Promise.all([
    db
      .select({
        averageScore: mediaItemAverageScoreSql,
        code: mediaItems.code,
        coverThumbUrl: mediaItems.coverThumbUrl,
        coverUrl: mediaItems.coverUrl,
        id: mediaItems.id,
        mediaCarrierName: mediaCarriers.name,
        mediaType: mediaItems.mediaType,
        mediaTypeLabel: mediaTypes.name,
        metadataFacts: mediaItemMetadata.facts,
        originalTitle: mediaItems.originalTitle,
        ratingsCount: mediaItemRatingsCountSql,
        releaseYear: mediaItems.releaseYear,
        title: mediaItems.title,
      })
      .from(mediaItems)
      .innerJoin(mediaTypes, eq(mediaTypes.code, mediaItems.mediaType))
      .leftJoin(mediaCarriers, eq(mediaCarriers.id, mediaItems.mediaCarrierId))
      .leftJoin(mediaItemMetadata, eq(mediaItemMetadata.mediaItemId, mediaItems.id))
      .leftJoin(mediaItemRatingStats, eq(mediaItemRatingStats.mediaItemId, mediaItems.id))
      .where(
        and(
          inArray(mediaItems.id, orderedIds),
          publishedMediaItemCondition,
          eq(mediaTypes.isPubliclyAvailable, true),
        ),
      ),
    db
      .select({
        code: franchises.code,
        id: franchises.id,
        mediaItemId: mediaItemFranchises.mediaItemId,
        title: franchises.title,
      })
      .from(mediaItemFranchises)
      .innerJoin(franchises, eq(franchises.id, mediaItemFranchises.franchiseId))
      .where(
        and(
          inArray(mediaItemFranchises.mediaItemId, orderedIds),
          eq(mediaItemFranchises.publicationStatus, PUBLISHED_PUBLICATION_STATUS),
          eq(franchises.publicationStatus, PUBLISHED_PUBLICATION_STATUS),
        ),
      )
      .orderBy(asc(franchises.title), asc(franchises.id)),
  ]);
  const franchisesByMediaItemId = new Map<number, typeof franchiseRows>();

  for (const franchise of franchiseRows) {
    franchisesByMediaItemId.set(franchise.mediaItemId, [
      ...(franchisesByMediaItemId.get(franchise.mediaItemId) ?? []),
      franchise,
    ]);
  }

  const itemsById = new Map(itemRows.map((item) => [item.id, item]));
  const items = orderedIds.flatMap((id) => {
    const item = itemsById.get(id);

    if (!item) {
      return [];
    }

    return [{
      ...item,
      coverThumbUrl: resolveCoverUrl(item.coverThumbUrl),
      coverUrl: resolveCoverUrl(item.coverUrl),
      franchises: (franchisesByMediaItemId.get(id) ?? []).map((franchise) => ({
        code: franchise.code,
        id: franchise.id,
        title: franchise.title,
      })),
    }];
  });

  return {
    items,
    page,
    pageSize: input.pageSize,
    totalCount,
    totalPages,
  };
}

export async function getAdminMediaBrowserFilterOptions() {
  const [mediaTypeRows, franchiseRows] = await Promise.all([
    db
      .select({
        code: mediaTypes.code,
        description: mediaTypes.description,
        name: mediaTypes.name,
      })
      .from(mediaTypes)
      .where(eq(mediaTypes.isPubliclyAvailable, true))
      .orderBy(asc(mediaTypes.name), asc(mediaTypes.code)),
    db
      .select({
        id: franchises.id,
        originalTitle: franchises.originalTitle,
        parentId: franchises.parentId,
        title: franchises.title,
      })
      .from(franchises)
      .where(eq(franchises.publicationStatus, PUBLISHED_PUBLICATION_STATUS))
      .orderBy(asc(franchises.title), asc(franchises.id)),
  ]);
  const franchisesById = new Map(franchiseRows.map((franchise) => [franchise.id, franchise]));

  function getFranchisePath(franchise: (typeof franchiseRows)[number]) {
    const path = [franchise.title];
    const visitedIds = new Set([franchise.id]);
    let parentId = franchise.parentId;

    while (parentId && !visitedIds.has(parentId)) {
      const parent = franchisesById.get(parentId);

      if (!parent) {
        break;
      }

      path.unshift(parent.title);
      visitedIds.add(parent.id);
      parentId = parent.parentId;
    }

    return path.join(" / ");
  }

  const series = franchiseRows.map((franchise): AdminMediaBrowserSeriesOption => ({
    id: franchise.id,
    originalTitle: franchise.originalTitle,
    path: getFranchisePath(franchise),
    title: franchise.title,
  }));

  return {
    mediaTypes: mediaTypeRows,
    series,
  };
}
