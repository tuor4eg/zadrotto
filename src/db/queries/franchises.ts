import { and, asc, desc, eq, exists, inArray, isNull, ne, notExists, or, sql, type SQLWrapper } from "drizzle-orm";

import { db } from "@/db";
import { getMediaTypeCodeFilterSql } from "@/db/queries/media-types";
import { mediaItemAverageScoreSql, mediaItemRatingsCountSql } from "@/db/queries/media-item-rating-stats";
import { containsNormalizedSearchSql, normalizeSearchSql } from "@/db/search";
import { authorMediaStatuses, authors, franchises, mediaCarriers, mediaItemFranchiseRemovalRequests, mediaItemFranchises, mediaItemMetadata, mediaItemRatingStats, mediaItemTitleAliases, mediaItems, ratings } from "@/db/schema";
import type { MainPageMediaItem } from "@/db/queries/main-page";
import { clampPage, getOffset, getTotalPages } from "@/lib/common/pagination";
import { PUBLISHED_PUBLICATION_STATUS } from "@/lib/media/publication-status";
import { resolveCoverUrl } from "@/lib/services/minio";
import { getArchiveSettings } from "@/db/queries/archive-settings";
import { AUTHOR_FRANCHISE_SUBMISSION_STATUSES } from "@/lib/authors/franchise-submission-filters";
import type { AuthorMediaStatus } from "@/lib/media/author-media-status";
import { normalizeSearchText } from "@/lib/search/normalize";
import { runInDomainEventTransaction, type DbTransaction } from "@/db/transaction";

const publishedMediaItemCondition = eq(
  mediaItems.publicationStatus,
  PUBLISHED_PUBLICATION_STATUS,
);
const publishedFranchiseCondition = eq(
  franchises.publicationStatus,
  PUBLISHED_PUBLICATION_STATUS,
);

function publishedFranchiseBranchIdsSql(franchiseId: number | SQLWrapper) {
  return sql`
    with recursive descendants as (
      select ${franchiseId}::integer as id
      union all
      select child.id
      from ${franchises} child
      inner join descendants parent on child.parent_id = parent.id
      where child.publication_status = ${PUBLISHED_PUBLICATION_STATUS}
    )
    select id from descendants
  `;
}

const MEDIA_ITEM_FRANCHISE_ADVISORY_LOCK_NAMESPACE = 58_391_039;

async function lockMediaItemFranchiseMutations(tx: DbTransaction, mediaItemIds: number[]) {
  const uniqueMediaItemIds = [...new Set(mediaItemIds)].sort((left, right) => left - right);

  if (uniqueMediaItemIds.length === 0) return;

  await tx.execute(sql`
    select pg_advisory_xact_lock(
      ${MEDIA_ITEM_FRANCHISE_ADVISORY_LOCK_NAMESPACE},
      locked_media_item.id
    )
    from (
      values ${sql.join(uniqueMediaItemIds.map((id) => sql`(${id}::integer)`), sql`, `)}
    ) as locked_media_item(id)
    order by locked_media_item.id
  `);
}

async function deleteRedundantPublishedMediaItemFranchiseLinks(
  tx: DbTransaction,
  mediaItemIds: number[],
) {
  const uniqueMediaItemIds = [...new Set(mediaItemIds)];

  if (uniqueMediaItemIds.length === 0) {
    return [];
  }

  return tx.execute<{ franchise_id: number; media_item_id: number }>(sql`
    with recursive ancestor_links as (
      select id as ancestor_id, parent_id, id as descendant_id
      from ${franchises}
      union all
      select parent.id, parent.parent_id, ancestor_links.descendant_id
      from ${franchises} parent
      inner join ancestor_links on parent.id = ancestor_links.parent_id
    )
    delete from ${mediaItemFranchises} direct_link
    using ${mediaItemFranchises} descendant_link, ancestor_links
    where direct_link.media_item_id in ${uniqueMediaItemIds}
      and direct_link.media_item_id = descendant_link.media_item_id
      and direct_link.franchise_id = ancestor_links.ancestor_id
      and descendant_link.franchise_id = ancestor_links.descendant_id
      and ancestor_links.ancestor_id <> ancestor_links.descendant_id
      and direct_link.publication_status = ${PUBLISHED_PUBLICATION_STATUS}
      and descendant_link.publication_status = ${PUBLISHED_PUBLICATION_STATUS}
    returning
      direct_link.franchise_id,
      direct_link.media_item_id
  `);
}

const mediaItemTitleAliasesSql = (mediaItemId = mediaItems.id) => sql<string[]>`coalesce((
  select jsonb_agg(${mediaItemTitleAliases.value} order by ${mediaItemTitleAliases.id})
  from ${mediaItemTitleAliases}
  where ${mediaItemTitleAliases.mediaItemId} = ${mediaItemId}
), '[]'::jsonb)`;

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

const currentAuthorStatusSql = (currentAuthorId?: number) =>
  currentAuthorId
    ? sql<AuthorMediaStatus | null>`(
        select ${authorMediaStatuses.status}
        from ${authorMediaStatuses}
        where ${authorMediaStatuses.mediaItemId} = ${mediaItems.id}
          and ${authorMediaStatuses.authorId} = ${currentAuthorId}
        limit 1
      )`
    : sql<AuthorMediaStatus | null>`null`;

type FranchiseLink = {
  id: number;
  code: string;
  title: string;
  originalTitle: string | null;
};

type FranchiseBreadcrumb = {
  id: number;
  code: string;
  title: string;
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
    and "franchises"."publication_status" = ${PUBLISHED_PUBLICATION_STATUS}
    and "media_item_franchises"."publication_status" = ${PUBLISHED_PUBLICATION_STATUS}
), '[]'::jsonb)`;

export async function getFranchiseByCode(code: string) {
  const [franchise] = await db
    .select({
      id: franchises.id,
      code: franchises.code,
      title: franchises.title,
      originalTitle: franchises.originalTitle,
      publicationStatus: franchises.publicationStatus,
      description: franchises.description,
      parentId: franchises.parentId,
    })
    .from(franchises)
    .where(
      and(
        eq(franchises.code, code),
        publishedFranchiseCondition,
      ),
    )
    .limit(1);

  if (!franchise) return null;

  const parents: FranchiseBreadcrumb[] = [];
  const visitedParentIds = new Set([franchise.id]);
  let parentId = franchise.parentId;

  while (parentId && !visitedParentIds.has(parentId)) {
    visitedParentIds.add(parentId);
    const [parent] = await db
      .select({
        id: franchises.id,
        code: franchises.code,
        title: franchises.title,
        parentId: franchises.parentId,
      })
      .from(franchises)
      .where(and(eq(franchises.id, parentId), publishedFranchiseCondition))
      .limit(1);

    if (!parent) break;

    parents.unshift({ id: parent.id, code: parent.code, title: parent.title });
    parentId = parent.parentId;
  }

  return { ...franchise, parents };
}

export async function getFranchiseOptions(currentAuthorId?: number) {
  return db
    .select({
      code: franchises.code,
      id: franchises.id,
      title: franchises.title,
      originalTitle: franchises.originalTitle,
      publicationStatus: franchises.publicationStatus,
    })
    .from(franchises)
    .where(
      currentAuthorId
        ? or(
            publishedFranchiseCondition,
            eq(franchises.createdByAuthorId, currentAuthorId),
          )
        : undefined,
    )
    .orderBy(asc(franchises.title));
}

export async function getFranchiseTitlesByIds(ids: readonly number[]) {
  if (ids.length === 0) {
    return [];
  }

  return db
    .select({
      id: franchises.id,
      title: franchises.title,
    })
    .from(franchises)
    .where(inArray(franchises.id, [...new Set(ids)]));
}

export async function getAdminFranchiseOptions() {
  return db
    .select({
      id: franchises.id,
      title: franchises.title,
      originalTitle: franchises.originalTitle,
      publicationStatus: franchises.publicationStatus,
    })
    .from(franchises)
    .orderBy(asc(franchises.title), asc(franchises.code));
}

export async function getAiFranchiseCandidates(currentAuthorId?: number) {
  const visibilityCondition = currentAuthorId
    ? or(publishedFranchiseCondition, eq(franchises.createdByAuthorId, currentAuthorId))
    : undefined;
  const mediaVisibilityCondition = currentAuthorId
    ? or(publishedMediaItemCondition, eq(mediaItems.createdByAuthorId, currentAuthorId))
    : undefined;
  const linkVisibilityCondition = currentAuthorId
    ? or(
        eq(mediaItemFranchises.publicationStatus, PUBLISHED_PUBLICATION_STATUS),
        eq(mediaItemFranchises.createdByAuthorId, currentAuthorId),
      )
    : undefined;
  const [franchiseRows, mediaRows] = await Promise.all([
    db
      .select({
        id: franchises.id,
        parentId: franchises.parentId,
        title: franchises.title,
        originalTitle: franchises.originalTitle,
        description: franchises.description,
      })
      .from(franchises)
      .where(visibilityCondition)
      .orderBy(asc(franchises.title), asc(franchises.id)),
    db
      .select({
        franchiseId: mediaItemFranchises.franchiseId,
        title: mediaItems.title,
        mediaType: mediaItems.mediaType,
        releaseYear: mediaItems.releaseYear,
      })
      .from(mediaItemFranchises)
      .innerJoin(franchises, eq(franchises.id, mediaItemFranchises.franchiseId))
      .innerJoin(mediaItems, eq(mediaItems.id, mediaItemFranchises.mediaItemId))
      .where(and(
        visibilityCondition,
        mediaVisibilityCondition,
        linkVisibilityCondition,
      ))
      .orderBy(
        asc(mediaItemFranchises.franchiseId),
        desc(mediaItems.releaseYear),
        asc(mediaItems.title),
      ),
  ]);
  const rowsById = new Map(franchiseRows.map((row) => [row.id, row]));
  const mediaByFranchiseId = new Map<number, typeof mediaRows>();

  for (const media of mediaRows) {
    const items = mediaByFranchiseId.get(media.franchiseId) ?? [];
    if (items.length < 5) {
      items.push(media);
      mediaByFranchiseId.set(media.franchiseId, items);
    }
  }

  return franchiseRows.map((row) => {
    const path = [row.title];
    const visitedIds = new Set([row.id]);
    let parentId = row.parentId;

    while (parentId && !visitedIds.has(parentId)) {
      visitedIds.add(parentId);
      const parent = rowsById.get(parentId);
      if (!parent) break;
      path.unshift(parent.title);
      parentId = parent.parentId;
    }

    return {
      id: row.id,
      path: path.join(" / "),
      title: row.title,
      originalTitle: row.originalTitle,
      description: row.description,
      mediaItems: (mediaByFranchiseId.get(row.id) ?? []).map((item) => ({
        title: item.title,
        mediaType: item.mediaType,
        releaseYear: item.releaseYear,
      })),
    };
  });
}

export async function getPublishedFranchiseOptions() {
  return db
    .select({
      code: franchises.code,
      id: franchises.id,
      title: franchises.title,
      originalTitle: franchises.originalTitle,
      publicationStatus: franchises.publicationStatus,
    })
    .from(franchises)
    .where(publishedFranchiseCondition)
    .orderBy(asc(franchises.title));
}

export async function getRandomPublishedFranchisePreview(input: {
  currentAuthorId?: number;
  enabledMediaTypeCodes: readonly string[];
}): Promise<{
  franchise: { code: string; title: string };
  items: MainPageMediaItem[];
} | null> {
  if (input.enabledMediaTypeCodes.length === 0) {
    return null;
  }

  const [franchise] = await db.execute<{ id: number; code: string; title: string }>(sql`
    with recursive published_franchise_branches as (
      select root.id as root_id, root.id as descendant_id
      from ${franchises} root
      where root.publication_status = ${PUBLISHED_PUBLICATION_STATUS}

      union all

      select branch.root_id, child.id
      from published_franchise_branches branch
      inner join ${franchises} child on child.parent_id = branch.descendant_id
      where child.publication_status = ${PUBLISHED_PUBLICATION_STATUS}
    )
    select root.id, root.code, root.title
    from published_franchise_branches branch
    inner join ${franchises} root on root.id = branch.root_id
    inner join ${mediaItemFranchises}
      on ${mediaItemFranchises.franchiseId} = branch.descendant_id
    inner join ${mediaItems}
      on ${mediaItems.id} = ${mediaItemFranchises.mediaItemId}
    where ${mediaItemFranchises.publicationStatus} = ${PUBLISHED_PUBLICATION_STATUS}
      and ${mediaItems.publicationStatus} = ${PUBLISHED_PUBLICATION_STATUS}
      and ${getMediaTypeCodeFilterSql(mediaItems.mediaType, input.enabledMediaTypeCodes)}
    group by root.id
    having count(distinct ${mediaItemFranchises.mediaItemId}) >= 5
    order by random()
    limit 1
  `);

  if (!franchise) {
    return null;
  }

  const rows = await db
    .select({
      averageScore: mediaItemAverageScoreSql,
      code: mediaItems.code,
      coverThumbUrl: mediaItems.coverThumbUrl,
      coverUrl: mediaItems.coverUrl,
      currentAuthorScore: currentAuthorScoreSql(input.currentAuthorId),
      id: mediaItems.id,
      mediaCarrierCode: mediaCarriers.code,
      mediaType: mediaItems.mediaType,
      metadataFacts: mediaItemMetadata.facts,
      ratingsCount: mediaItemRatingsCountSql,
      releaseYear: mediaItems.releaseYear,
      title: mediaItems.title,
    })
    .from(mediaItemFranchises)
    .innerJoin(mediaItems, eq(mediaItems.id, mediaItemFranchises.mediaItemId))
    .leftJoin(mediaCarriers, eq(mediaCarriers.id, mediaItems.mediaCarrierId))
    .leftJoin(mediaItemMetadata, eq(mediaItemMetadata.mediaItemId, mediaItems.id))
    .leftJoin(mediaItemRatingStats, eq(mediaItemRatingStats.mediaItemId, mediaItems.id))
    .where(and(
      sql`${mediaItemFranchises.franchiseId} in (${publishedFranchiseBranchIdsSql(franchise.id)})`,
      eq(mediaItemFranchises.publicationStatus, PUBLISHED_PUBLICATION_STATUS),
      publishedMediaItemCondition,
      getMediaTypeCodeFilterSql(mediaItems.mediaType, input.enabledMediaTypeCodes),
    ))
    .groupBy(
      mediaItems.id,
      mediaCarriers.code,
      mediaItemMetadata.facts,
      mediaItemRatingStats.ratingsCount,
      mediaItemRatingStats.scoreSum,
    )
    .orderBy(
      sql`${mediaItems.releaseYear} desc nulls last`,
      asc(mediaItems.title),
      asc(mediaItems.id),
    )
    .limit(12);

  return {
    franchise,
    items: rows.map((item) => ({
      ...item,
      coverThumbUrl: resolveCoverUrl(item.coverThumbUrl),
      coverUrl: resolveCoverUrl(item.coverUrl),
    })),
  };
}

export async function getPublishedFranchiseOptionById(id: number) {
  const [franchise] = await db
    .select({
      code: franchises.code,
      id: franchises.id,
      parentId: franchises.parentId,
      title: franchises.title,
      originalTitle: franchises.originalTitle,
      publicationStatus: franchises.publicationStatus,
    })
    .from(franchises)
    .where(and(eq(franchises.id, id), publishedFranchiseCondition))
    .limit(1);

  if (!franchise) {
    return null;
  }

  const parentIds: number[] = [];
  const path = [franchise.title];
  const visitedIds = new Set([franchise.id]);
  let parentId = franchise.parentId;

  while (parentId && !visitedIds.has(parentId)) {
    visitedIds.add(parentId);
    const [parent] = await db
      .select({
        id: franchises.id,
        parentId: franchises.parentId,
        title: franchises.title,
      })
      .from(franchises)
      .where(and(eq(franchises.id, parentId), publishedFranchiseCondition))
      .limit(1);

    if (!parent) {
      break;
    }

    parentIds.unshift(parent.id);
    path.unshift(parent.title);
    parentId = parent.parentId;
  }

  return {
    code: franchise.code,
    id: franchise.id,
    title: franchise.title,
    originalTitle: franchise.originalTitle,
    publicationStatus: franchise.publicationStatus,
    parentIds,
    path: path.join(" / "),
  };
}

export async function searchPublishedMediaItemsForFranchise(input: {
  authorId: number;
  enabledMediaTypeCodes: readonly string[];
  franchiseId: number;
  searchQuery: string;
}) {
  const normalizedSearchQuery = normalizeSearchText(input.searchQuery);

  if (normalizedSearchQuery.length < 2) {
    return [];
  }

  const codePattern = `%-${normalizedSearchQuery.replace(/\s+/g, "-")}-%`;
  const rows = await db
    .select({
      id: mediaItems.id,
      code: mediaItems.code,
      title: mediaItems.title,
      originalTitle: mediaItems.originalTitle,
      mediaType: mediaItems.mediaType,
      releaseYear: mediaItems.releaseYear,
      linkStatus: mediaItemFranchises.publicationStatus,
      linkAuthorId: mediaItemFranchises.createdByAuthorId,
    })
    .from(mediaItems)
    .leftJoin(
      mediaItemFranchises,
      and(
        eq(mediaItemFranchises.mediaItemId, mediaItems.id),
        eq(mediaItemFranchises.franchiseId, input.franchiseId),
      ),
    )
    .where(
      and(
        publishedMediaItemCondition,
        getMediaTypeCodeFilterSql(mediaItems.mediaType, input.enabledMediaTypeCodes),
        or(
          isNull(mediaItemFranchises.publicationStatus),
          ne(mediaItemFranchises.publicationStatus, PUBLISHED_PUBLICATION_STATUS),
        ),
        or(
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
        ),
      ),
    )
    .orderBy(asc(mediaItems.title), asc(mediaItems.code), asc(mediaItems.id))
    .limit(10);

  return rows.map(({ linkAuthorId, ...item }) => {
    const isOwnLink = linkAuthorId === input.authorId;
    const canRemove =
      isOwnLink &&
      item.linkStatus !== null &&
      item.linkStatus !== PUBLISHED_PUBLICATION_STATUS;

    return {
      ...item,
      linkStatus:
        !isOwnLink &&
        item.linkStatus !== null &&
        item.linkStatus !== PUBLISHED_PUBLICATION_STATUS
          ? "submitted" as const
          : item.linkStatus,
      canRemove,
    };
  });
}

export async function getPublishedFranchisesPage(input: {
  enabledMediaTypeCodes: readonly string[];
  page: number;
  pageSize: number;
  searchQuery: string;
}) {
  const tree = await getPublishedFranchiseTree(
    input.searchQuery,
    input.enabledMediaTypeCodes,
  );
  const countNodes = (nodes: FranchiseTreeNode[]): number =>
    nodes.reduce((count, node) => count + 1 + countNodes(node.children), 0);
  const paginationTotalCount = tree.length;
  const totalPages = getTotalPages(paginationTotalCount, input.pageSize);
  const page = clampPage(input.page, totalPages);
  const offset = getOffset(page, input.pageSize);
  const items = tree.slice(offset, offset + input.pageSize);

  return {
    items,
    page,
    pageSize: input.pageSize,
    paginationTotalCount,
    totalCount: countNodes(tree),
    totalPages,
  };
}

export type FranchiseTreeNode = {
  id: number;
  parentId: number | null;
  code: string;
  title: string;
  originalTitle: string | null;
  mediaItemsCount: number;
  children: FranchiseTreeNode[];
};

export type FranchiseBranchNode = {
  id: number;
  code: string;
  title: string;
  originalTitle: string | null;
  mediaItemsCount: number;
  children: FranchiseBranchNode[];
};

export async function getPublishedFranchiseBranch(
  franchiseId: number,
  enabledMediaTypeCodes: readonly string[],
) {
  const roots = await getPublishedFranchiseTree("", enabledMediaTypeCodes);

  const findBranch = (nodes: FranchiseTreeNode[]): FranchiseBranchNode | null => {
    for (const node of nodes) {
      if (node.id === franchiseId) {
        return node;
      }

      const branch = findBranch(node.children);

      if (branch) {
        return branch;
      }
    }

    return null;
  };

  return findBranch(roots);
}

async function getFranchiseSearchVisibleIds(input: {
  publishedOnly: boolean;
  searchQuery: string;
}) {
  const normalizedSearchQuery = normalizeSearchText(input.searchQuery);

  if (!normalizedSearchQuery) {
    return null;
  }

  const directVisibility = input.publishedOnly
    ? sql`publication_status = ${PUBLISHED_PUBLICATION_STATUS}`
    : sql`true`;
  const ancestorVisibility = input.publishedOnly
    ? sql`parent.publication_status = ${PUBLISHED_PUBLICATION_STATUS}`
    : sql`true`;
  const descendantVisibility = input.publishedOnly
    ? sql`child.publication_status = ${PUBLISHED_PUBLICATION_STATUS}`
    : sql`true`;
  const pattern = `%${normalizedSearchQuery}%`;
  const rows = await db.execute<{ id: number }>(sql`
    with recursive direct_matches as (
      select id, parent_id
      from franchises
      where ${directVisibility}
        and (
          ${normalizeSearchSql(sql.raw("title"))} like ${pattern}
          or ${normalizeSearchSql(sql.raw("original_title"))} like ${pattern}
          or ${normalizeSearchSql(sql.raw("code"))} like ${pattern}
        )
    ), ancestors as (
      select id, parent_id from direct_matches
      union
      select parent.id, parent.parent_id
      from franchises parent
      inner join ancestors child on child.parent_id = parent.id
      where ${ancestorVisibility}
    ), descendants as (
      select id, parent_id from direct_matches
      union
      select child.id, child.parent_id
      from franchises child
      inner join descendants parent on child.parent_id = parent.id
      where ${descendantVisibility}
    )
    select id from ancestors
    union
    select id from descendants
  `);

  return rows.map((row) => row.id);
}

export async function getPublishedFranchiseTree(
  searchQuery: string,
  enabledMediaTypeCodes: readonly string[],
) {
  const visibleIds = await getFranchiseSearchVisibleIds({
    publishedOnly: true,
    searchQuery,
  });

  if (visibleIds?.length === 0) {
    return [];
  }

  const rows = await db
    .select({
      id: franchises.id,
      parentId: franchises.parentId,
      code: franchises.code,
      title: franchises.title,
      originalTitle: franchises.originalTitle,
    })
    .from(franchises)
    .where(and(
      publishedFranchiseCondition,
      visibleIds ? inArray(franchises.id, visibleIds) : undefined,
    ))
    .orderBy(asc(franchises.title), asc(franchises.code));
  const links = await db
    .select({ franchiseId: mediaItemFranchises.franchiseId, mediaItemId: mediaItemFranchises.mediaItemId })
    .from(mediaItemFranchises)
    .innerJoin(mediaItems, eq(mediaItems.id, mediaItemFranchises.mediaItemId))
    .where(and(
      eq(mediaItemFranchises.publicationStatus, PUBLISHED_PUBLICATION_STATUS),
      publishedMediaItemCondition,
      getMediaTypeCodeFilterSql(mediaItems.mediaType, enabledMediaTypeCodes),
      visibleIds ? inArray(mediaItemFranchises.franchiseId, visibleIds) : undefined,
    ));

  const nodes = new Map<number, FranchiseTreeNode>();
  for (const row of rows) {
    nodes.set(row.id, { ...row, mediaItemsCount: 0, children: [] });
  }
  const mediaIdsByFranchise = new Map<number, Set<number>>();
  for (const link of links) {
    if (nodes.has(link.franchiseId)) {
      const ids = mediaIdsByFranchise.get(link.franchiseId) ?? new Set<number>();
      ids.add(link.mediaItemId);
      mediaIdsByFranchise.set(link.franchiseId, ids);
    }
  }
  const roots: FranchiseTreeNode[] = [];
  for (const node of nodes.values()) {
    const parent = node.parentId ? nodes.get(node.parentId) : undefined;
    if (parent) parent.children.push(node); else roots.push(node);
  }
  const countItems = (node: FranchiseTreeNode): Set<number> => {
    const ids = new Set(mediaIdsByFranchise.get(node.id));
    for (const child of node.children) for (const id of countItems(child)) ids.add(id);
    node.mediaItemsCount = ids.size;
    return ids;
  };
  roots.forEach(countItems);
  const removeEmptyBranches = (nodesToFilter: FranchiseTreeNode[]): FranchiseTreeNode[] =>
    nodesToFilter.flatMap((node) => {
      const children = removeEmptyBranches(node.children);

      return node.mediaItemsCount > 0 ? [{ ...node, children }] : [];
    });

  return removeEmptyBranches(roots);
}

export type FranchiseDuplicateMatch = {
  id: number;
  code: string;
  title: string;
  originalTitle: string | null;
};

export async function findPublishedFranchiseDuplicateCandidates(input: {
  title: string;
  originalTitle: string | null;
}): Promise<FranchiseDuplicateMatch[]> {
  const searchTerms = [input.title, input.originalTitle]
    .map((value) => normalizeSearchText(value ?? ""))
    .filter((value) => value.length >= 2);

  if (searchTerms.length === 0) {
    return [];
  }

  const selection = {
    id: franchises.id,
    code: franchises.code,
    title: franchises.title,
    originalTitle: franchises.originalTitle,
  };
  const exactCondition = or(
    ...searchTerms.flatMap((searchTerm) => [
      sql`${normalizeSearchSql(franchises.title)} = ${searchTerm}`,
      sql`${normalizeSearchSql(franchises.originalTitle)} = ${searchTerm}`,
    ]),
  );
  const similarCondition = or(
    ...searchTerms.flatMap((searchTerm) => {
      return [
        containsNormalizedSearchSql(franchises.title, searchTerm),
        containsNormalizedSearchSql(franchises.originalTitle, searchTerm),
        containsNormalizedSearchSql(franchises.code, searchTerm),
      ];
    }),
  );
  const [exactMatches, similarMatches] = await Promise.all([
    db
      .select(selection)
      .from(franchises)
      .where(and(publishedFranchiseCondition, exactCondition))
      .orderBy(asc(franchises.title), asc(franchises.code))
      .limit(1),
    db
      .select(selection)
      .from(franchises)
      .where(
        and(publishedFranchiseCondition, similarCondition),
      )
      .orderBy(asc(franchises.title), asc(franchises.code))
      .limit(10),
  ]);

  const exactIds = new Set(exactMatches.map((match) => match.id));
  return [...exactMatches, ...similarMatches.filter((match) => !exactIds.has(match.id))];
}

export async function getAdminFranchises(input: {
  page: number;
  pageSize: number;
  searchQuery: string;
}) {
  const tree = await getAdminFranchiseTree(input.searchQuery);
  const paginationTotalCount = tree.items.length;
  const totalPages = getTotalPages(paginationTotalCount, input.pageSize);
  const page = clampPage(input.page, totalPages);
  const offset = getOffset(page, input.pageSize);

  return {
    items: tree.items.slice(offset, offset + input.pageSize),
    page,
    pageSize: input.pageSize,
    paginationTotalCount,
    totalCount: tree.totalCount,
    totalPages,
  };
}

export type AdminFranchiseTreeNode = {
  id: number;
  parentId: number | null;
  code: string;
  title: string;
  originalTitle: string | null;
  mediaItemsCount: number;
  publicationStatus: "private" | "submitted" | "published" | "rejected";
  children: AdminFranchiseTreeNode[];
};

export async function getAdminFranchiseTree(searchQuery: string) {
  const visibleIds = await getFranchiseSearchVisibleIds({
    publishedOnly: false,
    searchQuery,
  });

  if (visibleIds?.length === 0) {
    const [{ totalCount }] = await db
      .select({ totalCount: sql<number>`count(*)::int` })
      .from(franchises);

    return { items: [], totalCount };
  }

  const [rows, links, [{ totalCount }]] = await Promise.all([
    db
      .select({
        id: franchises.id,
        parentId: franchises.parentId,
        code: franchises.code,
        title: franchises.title,
        originalTitle: franchises.originalTitle,
        publicationStatus: franchises.publicationStatus,
      })
      .from(franchises)
      .where(visibleIds ? inArray(franchises.id, visibleIds) : undefined)
      .orderBy(asc(franchises.title), asc(franchises.code)),
    db
      .select({
        franchiseId: mediaItemFranchises.franchiseId,
        mediaItemId: mediaItemFranchises.mediaItemId,
      })
      .from(mediaItemFranchises)
      .where(visibleIds ? inArray(mediaItemFranchises.franchiseId, visibleIds) : undefined),
    db
      .select({ totalCount: sql<number>`count(*)::int` })
      .from(franchises),
  ]);

  const nodesById = new Map<number, AdminFranchiseTreeNode>();

  for (const row of rows) {
    nodesById.set(row.id, { ...row, mediaItemsCount: 0, children: [] });
  }

  const mediaItemIdsByFranchise = new Map<number, Set<number>>();

  for (const link of links) {
    if (!nodesById.has(link.franchiseId)) continue;

    const mediaItemIds = mediaItemIdsByFranchise.get(link.franchiseId) ?? new Set<number>();
    mediaItemIds.add(link.mediaItemId);
    mediaItemIdsByFranchise.set(link.franchiseId, mediaItemIds);
  }

  const roots: AdminFranchiseTreeNode[] = [];

  for (const node of nodesById.values()) {
    const parent = node.parentId ? nodesById.get(node.parentId) : undefined;

    if (parent) {
      parent.children.push(node);
    } else {
      roots.push(node);
    }
  }

  function countBranchMediaItems(node: AdminFranchiseTreeNode): Set<number> {
    const mediaItemIds = new Set(mediaItemIdsByFranchise.get(node.id));

    for (const child of node.children) {
      for (const mediaItemId of countBranchMediaItems(child)) {
        mediaItemIds.add(mediaItemId);
      }
    }

    node.mediaItemsCount = mediaItemIds.size;
    return mediaItemIds;
  }

  roots.forEach(countBranchMediaItems);

  return { items: roots, totalCount };
}

export async function getAdminFranchiseById(id: number) {
  const [franchise] = await db
    .select({
      id: franchises.id,
      code: franchises.code,
      title: franchises.title,
      originalTitle: franchises.originalTitle,
      description: franchises.description,
      publicationStatus: franchises.publicationStatus,
      createdAt: franchises.createdAt,
      updatedAt: franchises.updatedAt,
      parentId: franchises.parentId,
    })
    .from(franchises)
    .where(eq(franchises.id, id))
    .limit(1);

  return franchise ?? null;
}

export async function getAdminFranchiseParentOptions(franchiseId?: number) {
  const rows = await db
    .select({ code: franchises.code, id: franchises.id, parentId: franchises.parentId, title: franchises.title, originalTitle: franchises.originalTitle })
    .from(franchises)
    .orderBy(asc(franchises.title), asc(franchises.code));
  const byId = new Map(rows.map((row) => [row.id, row]));
  const excluded = new Set<number>();
  if (franchiseId) {
    excluded.add(franchiseId);
    for (const row of rows) {
      let parentId = row.parentId;
      while (parentId) {
        if (parentId === franchiseId) { excluded.add(row.id); break; }
        parentId = byId.get(parentId)?.parentId ?? null;
      }
    }
  }
  const getPath = (row: typeof rows[number]) => {
    const parts = [row.title];
    let parentId = row.parentId;
    while (parentId) {
      const parent = byId.get(parentId);
      if (!parent) break;
      parts.unshift(parent.title);
      parentId = parent.parentId;
    }
    return parts.join(" / ");
  };
  return rows.filter((row) => !excluded.has(row.id)).map((row) => ({
    code: row.code, id: row.id, title: row.title, originalTitle: row.originalTitle, path: getPath(row),
  }));
}

export async function getAdminFranchiseChildCandidates(franchiseId: number) {
  const rows = await db.select({ code: franchises.code, id: franchises.id, parentId: franchises.parentId, title: franchises.title, originalTitle: franchises.originalTitle }).from(franchises).orderBy(asc(franchises.title));
  const byId = new Map(rows.map((row) => [row.id, row]));
  const related = new Set<number>([franchiseId]);
  let ancestorId = byId.get(franchiseId)?.parentId ?? null;
  while (ancestorId) { related.add(ancestorId); ancestorId = byId.get(ancestorId)?.parentId ?? null; }
  for (const row of rows) {
    let parentId = row.parentId;
    while (parentId) {
      if (parentId === franchiseId) { related.add(row.id); break; }
      parentId = byId.get(parentId)?.parentId ?? null;
    }
  }
  const path = (row: typeof rows[number]) => {
    const parts = [row.title]; let parentId = row.parentId;
    while (parentId) { const parent = byId.get(parentId); if (!parent) break; parts.unshift(parent.title); parentId = parent.parentId; }
    return parts.join(" / ");
  };
  return rows.filter((row) => !related.has(row.id)).map((row) => ({ code: row.code, id: row.id, title: row.title, originalTitle: row.originalTitle, path: path(row) }));
}

export async function getAdminFranchiseChildren(franchiseId: number) {
  const roots = await getAdminFranchiseTree("");
  const find = (nodes: AdminFranchiseTreeNode[]): AdminFranchiseTreeNode | null => {
    for (const node of nodes) {
      if (node.id === franchiseId) return node;
      const nested = find(node.children);
      if (nested) return nested;
    }
    return null;
  };
  return find(roots.items)?.children ?? [];
}

export type AdminFranchiseDescendantNode = {
  code: string;
  children: AdminFranchiseDescendantNode[];
  id: number;
  mediaItemsCount: number;
  title: string;
};

export async function getAdminFranchiseDescendantTree(franchiseId: number) {
  const rows = await db
    .select({ id: franchises.id, parentId: franchises.parentId, code: franchises.code, title: franchises.title, mediaItemsCount: sql<number>`count(${mediaItemFranchises.mediaItemId})::int` })
    .from(franchises)
    .leftJoin(mediaItemFranchises, eq(mediaItemFranchises.franchiseId, franchises.id))
    .groupBy(franchises.id, franchises.parentId, franchises.code, franchises.title)
    .orderBy(asc(franchises.title), asc(franchises.code));
  const childrenByParentId = new Map<number | null, typeof rows>();

  for (const row of rows) {
    childrenByParentId.set(row.parentId, [...(childrenByParentId.get(row.parentId) ?? []), row]);
  }

  function buildChildren(parentId: number, visitedIds: Set<number>): AdminFranchiseDescendantNode[] {
    return (childrenByParentId.get(parentId) ?? []).flatMap((child) => {
      if (visitedIds.has(child.id)) return [];
      const nextVisitedIds = new Set(visitedIds).add(child.id);
      return [{ id: child.id, code: child.code, title: child.title, mediaItemsCount: child.mediaItemsCount, children: buildChildren(child.id, nextVisitedIds) }];
    });
  }

  return buildChildren(franchiseId, new Set([franchiseId]));
}

export async function hasAdminFranchiseChildren(franchiseId: number) {
  const [child] = await db
    .select({ id: franchises.id })
    .from(franchises)
    .where(eq(franchises.parentId, franchiseId))
    .limit(1);

  return Boolean(child);
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

export async function authorCanUseFranchiseIds(input: { authorId: number; ids: number[] }) {
  const uniqueIds = [...new Set(input.ids)];

  if (uniqueIds.length === 0) {
    return true;
  }

  const rows = await db
    .select({ id: franchises.id })
    .from(franchises)
    .where(
      and(
        inArray(franchises.id, uniqueIds),
        or(
          publishedFranchiseCondition,
          eq(franchises.createdByAuthorId, input.authorId),
        ),
      ),
    );

  return rows.length === uniqueIds.length;
}

export async function moveAuthorFranchisesForMediaSubmission(input: {
  authorId: number;
  mediaItemId: number;
  nextStatus: Extract<"private" | "submitted" | "published" | "rejected", "submitted" | "published">;
}) {
  await db
    .update(franchises)
    .set({
      publicationStatus: input.nextStatus,
      updatedAt: new Date(),
    })
    .where(
      and(
        eq(franchises.createdByAuthorId, input.authorId),
        inArray(franchises.publicationStatus, ["private", "rejected"]),
        exists(
          db
            .select({ id: mediaItemFranchises.franchiseId })
            .from(mediaItemFranchises)
            .where(
              and(
                eq(mediaItemFranchises.mediaItemId, input.mediaItemId),
                eq(mediaItemFranchises.franchiseId, franchises.id),
              ),
            ),
        ),
      ),
    );
}

function getSubmittedFranchiseWithoutSubmittedMediaCondition() {
  return and(
    eq(franchises.publicationStatus, "submitted"),
    notExists(
      db
        .select({ id: mediaItemFranchises.franchiseId })
        .from(mediaItemFranchises)
        .innerJoin(mediaItems, eq(mediaItems.id, mediaItemFranchises.mediaItemId))
        .where(
          and(
            eq(mediaItemFranchises.franchiseId, franchises.id),
            eq(mediaItems.publicationStatus, "submitted"),
            eq(mediaItems.createdByAuthorId, franchises.createdByAuthorId),
          ),
        ),
    ),
  );
}

type FranchiseReviewMediaItemLink = {
  code: string;
  id: number;
  title: string;
};

const submittedFranchiseMediaItemsSql = (authorId = franchises.createdByAuthorId) =>
  sql<FranchiseReviewMediaItemLink[]>`coalesce((
    select jsonb_agg(
      jsonb_build_object(
        'id', ${mediaItems.id},
        'code', ${mediaItems.code},
        'title', ${mediaItems.title}
      )
      order by ${mediaItems.title}, ${mediaItems.code}
    )
    from ${mediaItemFranchises}
    inner join ${mediaItems} on ${mediaItems.id} = ${mediaItemFranchises.mediaItemId}
    where ${mediaItemFranchises.franchiseId} = ${franchises.id}
      and ${mediaItemFranchises.createdByAuthorId} = ${authorId}
      and ${mediaItemFranchises.publicationStatus} = 'submitted'
  ), '[]'::jsonb)`;

export async function getSubmittedFranchisesForAdmin() {
  const [submittedFranchises, submittedLinks, removalRequests] = await Promise.all([
    db
    .select({
      kind: sql<"franchise">`'franchise'`,
      id: franchises.id,
      code: franchises.code,
      title: franchises.title,
      originalTitle: franchises.originalTitle,
      description: franchises.description,
      mediaItems: submittedFranchiseMediaItemsSql(),
      createdAt: franchises.createdAt,
      authorId: authors.id,
      authorName: authors.name,
      authorCode: authors.code,
    })
    .from(franchises)
    .innerJoin(authors, eq(authors.id, franchises.createdByAuthorId))
    .where(getSubmittedFranchiseWithoutSubmittedMediaCondition())
    .orderBy(desc(franchises.updatedAt), asc(franchises.title)),
    db
      .select({
        kind: sql<"link">`'link'`,
        id: mediaItemFranchises.mediaItemId,
        franchiseId: franchises.id,
        code: mediaItems.code,
        title: mediaItems.title,
        originalTitle: mediaItems.originalTitle,
        description: sql<string | null>`null`,
        createdAt: mediaItemFranchises.createdAt,
        authorId: authors.id,
        authorName: authors.name,
        authorCode: authors.code,
        franchiseTitle: franchises.title,
      })
      .from(mediaItemFranchises)
      .innerJoin(mediaItems, eq(mediaItems.id, mediaItemFranchises.mediaItemId))
      .innerJoin(franchises, eq(franchises.id, mediaItemFranchises.franchiseId))
      .innerJoin(authors, eq(authors.id, mediaItemFranchises.createdByAuthorId))
      .where(
        and(
          eq(mediaItemFranchises.publicationStatus, "submitted"),
          publishedMediaItemCondition,
          publishedFranchiseCondition,
        ),
      )
      .orderBy(desc(mediaItemFranchises.createdAt), asc(mediaItems.title)),
    db.select({
      kind: sql<"removal">`'removal'`, id: mediaItems.id, franchiseId: franchises.id,
      code: mediaItems.code, title: mediaItems.title, originalTitle: mediaItems.originalTitle,
      description: sql<string | null>`null`, mediaItems: sql<[]>`'[]'::jsonb`,
      createdAt: mediaItemFranchiseRemovalRequests.createdAt,
      authorId: authors.id, authorName: authors.name, authorCode: authors.code,
      franchiseTitle: franchises.title,
    }).from(mediaItemFranchiseRemovalRequests)
      .innerJoin(mediaItems, eq(mediaItems.id, mediaItemFranchiseRemovalRequests.mediaItemId))
      .innerJoin(franchises, eq(franchises.id, mediaItemFranchiseRemovalRequests.franchiseId))
      .innerJoin(authors, eq(authors.id, mediaItemFranchiseRemovalRequests.requestedByAuthorId))
      .orderBy(desc(mediaItemFranchiseRemovalRequests.createdAt), asc(mediaItems.title)),
  ]);

  return [...submittedFranchises, ...submittedLinks, ...removalRequests].sort(
    (left, right) => right.createdAt.getTime() - left.createdAt.getTime(),
  );
}

export async function getSubmittedFranchisesCountForAdmin() {
  const [franchiseResult, linkResult, removalResult] = await Promise.all([
    db
    .select({ count: sql<number>`count(*)::int` })
    .from(franchises)
    .where(getSubmittedFranchiseWithoutSubmittedMediaCondition()),
    db
      .select({ count: sql<number>`count(*)::int` })
      .from(mediaItemFranchises)
      .innerJoin(mediaItems, eq(mediaItems.id, mediaItemFranchises.mediaItemId))
      .innerJoin(franchises, eq(franchises.id, mediaItemFranchises.franchiseId))
      .where(
        and(
          eq(mediaItemFranchises.publicationStatus, "submitted"),
          publishedMediaItemCondition,
          publishedFranchiseCondition,
        ),
      ),
    db.select({ count: sql<number>`count(*)::int` })
      .from(mediaItemFranchiseRemovalRequests),
  ]);

  return (franchiseResult[0]?.count ?? 0) + (linkResult[0]?.count ?? 0) + (removalResult[0]?.count ?? 0);
}

export async function reviewSubmittedFranchise(input: {
  adminUserId: number;
  decision: Extract<"private" | "submitted" | "published" | "rejected", "published" | "rejected">;
  franchiseId: number;
}) {
  return runInDomainEventTransaction(async (tx, appendEvent) => {
    const submittedLinks = await tx
      .select({ mediaItemId: mediaItemFranchises.mediaItemId })
      .from(mediaItemFranchises)
      .where(
        and(
          eq(mediaItemFranchises.franchiseId, input.franchiseId),
          eq(mediaItemFranchises.publicationStatus, "submitted"),
        ),
      );
    await lockMediaItemFranchiseMutations(
      tx,
      submittedLinks.map((link) => link.mediaItemId),
    );

    const [franchise] = await tx
      .update(franchises)
      .set({ publicationStatus: input.decision, updatedAt: new Date() })
      .where(
        and(
          eq(franchises.id, input.franchiseId),
          getSubmittedFranchiseWithoutSubmittedMediaCondition(),
        ),
      )
      .returning({
        id: franchises.id,
        code: franchises.code,
        title: franchises.title,
        createdByAuthorId: franchises.createdByAuthorId,
        publicationStatus: franchises.publicationStatus,
      });

    if (franchise?.createdByAuthorId) {
      const publishedLinks = await tx
        .update(mediaItemFranchises)
        .set({ publicationStatus: input.decision, updatedAt: new Date() })
        .where(
          and(
            eq(mediaItemFranchises.franchiseId, franchise.id),
            eq(mediaItemFranchises.createdByAuthorId, franchise.createdByAuthorId),
            eq(mediaItemFranchises.publicationStatus, "submitted"),
          ),
        )
        .returning({ franchiseId: mediaItemFranchises.franchiseId, mediaItemId: mediaItemFranchises.mediaItemId });
      if (input.decision === "published") {
        const removedLinks = await deleteRedundantPublishedMediaItemFranchiseLinks(
          tx,
          publishedLinks.map((link) => link.mediaItemId),
        );
        const removedLinkKeys = new Set(
          removedLinks.map((link) => `${link.media_item_id}:${link.franchise_id}`),
        );
        await appendEvent({
          actorAuthorId: null,
          aggregateId: String(franchise.id),
          aggregateType: "franchise",
          payload: { authorId: franchise.createdByAuthorId, franchiseId: franchise.id },
          type: "franchise.approved",
        });
        for (const link of publishedLinks) {
          if (removedLinkKeys.has(`${link.mediaItemId}:${link.franchiseId}`)) continue;
          await appendEvent({
            actorAuthorId: null,
            aggregateId: `${link.mediaItemId}:${link.franchiseId}`,
            aggregateType: "media-franchise",
            payload: link,
            type: "media-franchise.published",
          });
        }
      }
    }

    return franchise ?? null;
  });
}

export async function reviewSubmittedMediaItemFranchise(input: {
  adminUserId: number;
  decision: Extract<"private" | "submitted" | "published" | "rejected", "published" | "rejected">;
  franchiseId: number;
  mediaItemId: number;
}) {
  return runInDomainEventTransaction(async (tx, appendEvent) => {
    await lockMediaItemFranchiseMutations(tx, [input.mediaItemId]);
    const [link] = await tx
      .update(mediaItemFranchises)
      .set({ publicationStatus: input.decision, updatedAt: new Date() })
      .where(and(
        eq(mediaItemFranchises.mediaItemId, input.mediaItemId),
        eq(mediaItemFranchises.franchiseId, input.franchiseId),
        eq(mediaItemFranchises.publicationStatus, "submitted"),
        exists(tx.select({ id: mediaItems.id }).from(mediaItems)
          .where(and(eq(mediaItems.id, input.mediaItemId), publishedMediaItemCondition))),
        exists(tx.select({ id: franchises.id }).from(franchises)
          .where(and(eq(franchises.id, input.franchiseId), publishedFranchiseCondition))),
      ))
      .returning({
        createdByAuthorId: mediaItemFranchises.createdByAuthorId,
        franchiseId: mediaItemFranchises.franchiseId,
        mediaItemId: mediaItemFranchises.mediaItemId,
      });
    if (link && input.decision === "published") {
      const removedLinks = await deleteRedundantPublishedMediaItemFranchiseLinks(
        tx,
        [link.mediaItemId],
      );
      const linkWasRemoved = removedLinks.some(
        (removed) =>
          removed.media_item_id === link.mediaItemId &&
          removed.franchise_id === link.franchiseId,
      );
      if (!linkWasRemoved) {
        await appendEvent({
          actorAuthorId: null,
          aggregateId: `${link.mediaItemId}:${link.franchiseId}`,
          aggregateType: "media-franchise",
          payload: { franchiseId: link.franchiseId, mediaItemId: link.mediaItemId },
          type: "media-franchise.published",
        });
        if (link.createdByAuthorId) {
          await appendEvent({
            actorAuthorId: null,
            aggregateId: `${link.mediaItemId}:${link.franchiseId}`,
            aggregateType: "media-franchise",
            payload: {
              authorId: link.createdByAuthorId,
              franchiseId: link.franchiseId,
              mediaItemId: link.mediaItemId,
            },
            type: "media-franchise.approved",
          });
        }
      }
    }
    return link ?? null;
  });
}

export async function reviewMediaItemFranchiseRemovalRequest(input: {
  decision: "published" | "rejected";
  franchiseId: number;
  mediaItemId: number;
}) {
  return runInDomainEventTransaction(async (tx, appendEvent) => {
    if (input.decision === "published") {
      const [request] = await tx
        .select({
          requestedByAuthorId: mediaItemFranchiseRemovalRequests.requestedByAuthorId,
        })
        .from(mediaItemFranchiseRemovalRequests)
        .where(and(
          eq(mediaItemFranchiseRemovalRequests.mediaItemId, input.mediaItemId),
          eq(mediaItemFranchiseRemovalRequests.franchiseId, input.franchiseId),
        ))
        .limit(1)
        .for("update")
      if (!request) return null
      const [link] = await tx.delete(mediaItemFranchises).where(and(
        eq(mediaItemFranchises.mediaItemId, input.mediaItemId),
        eq(mediaItemFranchises.franchiseId, input.franchiseId),
        eq(mediaItemFranchises.publicationStatus, "published"),
        exists(tx.select({ mediaItemId: mediaItemFranchiseRemovalRequests.mediaItemId })
          .from(mediaItemFranchiseRemovalRequests)
          .where(and(
            eq(mediaItemFranchiseRemovalRequests.mediaItemId, input.mediaItemId),
            eq(mediaItemFranchiseRemovalRequests.franchiseId, input.franchiseId),
          ))),
      )).returning({ mediaItemId: mediaItemFranchises.mediaItemId });
      if (link) {
        await appendEvent({
          actorAuthorId: null,
          aggregateId: `${input.mediaItemId}:${input.franchiseId}`,
          aggregateType: "media-franchise",
          payload: {
            authorId: request.requestedByAuthorId,
            franchiseId: input.franchiseId,
            mediaItemId: input.mediaItemId,
          },
          type: "media-franchise.removal.approved",
        })
      }
      return link ?? null;
    }
    const [request] = await tx.delete(mediaItemFranchiseRemovalRequests).where(and(
      eq(mediaItemFranchiseRemovalRequests.mediaItemId, input.mediaItemId),
      eq(mediaItemFranchiseRemovalRequests.franchiseId, input.franchiseId),
    )).returning({ mediaItemId: mediaItemFranchiseRemovalRequests.mediaItemId });
    return request ?? null;
  });
}

export async function createAuthorMediaItemFranchiseLinks(input: {
  authorId: number;
  franchiseIds: number[];
  mediaItemId: number;
  publicationStatus: "published" | "submitted";
}) {
  return runInDomainEventTransaction(async (tx, appendEvent) => {
    const franchiseIds = [...new Set(input.franchiseIds)];

    if (franchiseIds.length === 0) {
      return null;
    }

    await lockMediaItemFranchiseMutations(tx, [input.mediaItemId]);

    const [mediaItem] = await tx
      .select({ id: mediaItems.id })
      .from(mediaItems)
      .where(and(eq(mediaItems.id, input.mediaItemId), publishedMediaItemCondition))
      .limit(1);
    const availableFranchises = await tx
      .select({ id: franchises.id, title: franchises.title })
      .from(franchises)
      .where(and(inArray(franchises.id, franchiseIds), publishedFranchiseCondition));

    if (!mediaItem || availableFranchises.length !== franchiseIds.length) {
      return null;
    }

    const availableFranchisesById = new Map(
      availableFranchises.map((franchise) => [franchise.id, franchise]),
    );

    const existingLinks = await tx
      .select({ franchiseId: mediaItemFranchises.franchiseId })
      .from(mediaItemFranchises)
      .where(
        and(
          eq(mediaItemFranchises.mediaItemId, input.mediaItemId),
          inArray(mediaItemFranchises.franchiseId, franchiseIds),
        ),
      );

    if (existingLinks.length > 0) {
      return null;
    }

    await tx
      .insert(mediaItemFranchises)
      .values(franchiseIds.map((franchiseId) => ({
        mediaItemId: input.mediaItemId,
        franchiseId,
        createdByAuthorId: input.authorId,
        publicationStatus: input.publicationStatus,
      })));

    let retainedFranchiseIds = franchiseIds;
    if (input.publicationStatus === "published") {
      const removedLinks = await deleteRedundantPublishedMediaItemFranchiseLinks(
        tx,
        [input.mediaItemId],
      );
      const removedFranchiseIds = new Set(
        removedLinks
          .filter((link) => link.media_item_id === input.mediaItemId)
          .map((link) => link.franchise_id),
      );
      retainedFranchiseIds = franchiseIds.filter(
        (franchiseId) => !removedFranchiseIds.has(franchiseId),
      );
      for (const franchiseId of retainedFranchiseIds) {
        await appendEvent({
          actorAuthorId: input.authorId,
          aggregateId: `${input.mediaItemId}:${franchiseId}`,
          aggregateType: "media-franchise",
          payload: { franchiseId, mediaItemId: input.mediaItemId },
          type: "media-franchise.published",
        });
      }
    }

    if (input.publicationStatus === "submitted") {
      for (const franchiseId of franchiseIds) {
        await appendEvent({
          actorAuthorId: input.authorId,
          aggregateId: `${input.mediaItemId}:${franchiseId}`,
          aggregateType: "media-franchise",
          payload: {
            authorId: input.authorId,
            franchiseId,
            mediaItemId: input.mediaItemId,
          },
          type: "media-franchise.submitted",
        });
      }
    }

    return retainedFranchiseIds.map((franchiseId) => availableFranchisesById.get(franchiseId)!);
  });
}

export async function removeAuthorMediaItemFranchiseLink(input: {
  authorId: number;
  franchiseId: number;
  mediaItemId: number;
}) {
  const [removedLink] = await db
    .delete(mediaItemFranchises)
    .where(
      and(
        eq(mediaItemFranchises.mediaItemId, input.mediaItemId),
        eq(mediaItemFranchises.franchiseId, input.franchiseId),
        eq(mediaItemFranchises.createdByAuthorId, input.authorId),
        inArray(mediaItemFranchises.publicationStatus, ["private", "submitted", "rejected"]),
      ),
    )
    .returning({
      franchiseId: mediaItemFranchises.franchiseId,
      mediaItemId: mediaItemFranchises.mediaItemId,
    });

  return removedLink ?? null;
}

export async function requestAuthorMediaItemFranchiseRemoval(input: {
  authorId: number;
  canPublishFranchisesWithoutReview: boolean;
  franchiseId: number;
  mediaItemId: number;
}) {
  return runInDomainEventTransaction(async (tx, appendEvent) => {
    const [link] = await tx.select({
      createdByAuthorId: mediaItemFranchises.createdByAuthorId,
      franchiseId: franchises.id,
      franchiseTitle: franchises.title,
      publicationStatus: mediaItemFranchises.publicationStatus,
    })
      .from(mediaItemFranchises)
      .innerJoin(franchises, eq(franchises.id, mediaItemFranchises.franchiseId))
      .where(and(
      eq(mediaItemFranchises.mediaItemId, input.mediaItemId),
      eq(mediaItemFranchises.franchiseId, input.franchiseId),
    )).limit(1);
    if (!link) return null;
    if (link.publicationStatus !== "published") {
      if (link.createdByAuthorId !== input.authorId) return null;
      const [removed] = await tx.delete(mediaItemFranchises).where(and(
        eq(mediaItemFranchises.mediaItemId, input.mediaItemId),
        eq(mediaItemFranchises.franchiseId, input.franchiseId),
      )).returning({ mediaItemId: mediaItemFranchises.mediaItemId });
      return removed
        ? {
            status: "removed" as const,
            franchise: { id: link.franchiseId, title: link.franchiseTitle },
          }
        : null;
    }
    if (input.canPublishFranchisesWithoutReview) {
      const [removed] = await tx.delete(mediaItemFranchises).where(and(
        eq(mediaItemFranchises.mediaItemId, input.mediaItemId),
        eq(mediaItemFranchises.franchiseId, input.franchiseId),
      )).returning({ mediaItemId: mediaItemFranchises.mediaItemId });
      return removed
        ? {
            status: "removed" as const,
            franchise: { id: link.franchiseId, title: link.franchiseTitle },
          }
        : null;
    }
    const [requested] = await tx.insert(mediaItemFranchiseRemovalRequests).values({
      mediaItemId: input.mediaItemId,
      franchiseId: input.franchiseId,
      requestedByAuthorId: input.authorId,
    }).onConflictDoNothing().returning({
      franchiseId: mediaItemFranchiseRemovalRequests.franchiseId,
      mediaItemId: mediaItemFranchiseRemovalRequests.mediaItemId,
    });
    if (requested) {
      await appendEvent({
        actorAuthorId: input.authorId,
        aggregateId: `${requested.mediaItemId}:${requested.franchiseId}`,
        aggregateType: "media-franchise",
        payload: {
          authorId: input.authorId,
          franchiseId: requested.franchiseId,
          mediaItemId: requested.mediaItemId,
        },
        type: "media-franchise.removal.requested",
      })
    }
    return {
      status: "requested" as const,
      franchise: { id: link.franchiseId, title: link.franchiseTitle },
    };
  });
}

export async function createAuthorFranchiseWithMediaItemLink(input: {
  authorId: number;
  code: string;
  description: string | null;
  mediaItemId: number;
  originalTitle: string | null;
  parentId: number | null;
  publicationStatus: "published" | "submitted";
  title: string;
}) {
  return runInDomainEventTransaction(async (tx, appendEvent) => {
    await lockMediaItemFranchiseMutations(tx, [input.mediaItemId]);
    const [mediaItem] = await tx
      .select({ id: mediaItems.id })
      .from(mediaItems)
      .where(and(eq(mediaItems.id, input.mediaItemId), publishedMediaItemCondition))
      .limit(1);

    if (!mediaItem) {
      return null;
    }

    const [franchise] = await tx
      .insert(franchises)
      .values({
        code: input.code,
        title: input.title,
        originalTitle: input.originalTitle,
        description: input.description,
        createdByAuthorId: input.authorId,
        parentId: input.parentId,
        publicationStatus: input.publicationStatus,
      })
      .returning({ id: franchises.id, code: franchises.code, title: franchises.title });

    await tx.insert(mediaItemFranchises).values({
      mediaItemId: input.mediaItemId,
      franchiseId: franchise.id,
      createdByAuthorId: input.authorId,
      publicationStatus: input.publicationStatus,
    });

    if (input.publicationStatus === "published") {
      await deleteRedundantPublishedMediaItemFranchiseLinks(tx, [input.mediaItemId]);
      await appendEvent({
        actorAuthorId: input.authorId,
        aggregateId: `${input.mediaItemId}:${franchise.id}`,
        aggregateType: "media-franchise",
        payload: { franchiseId: franchise.id, mediaItemId: input.mediaItemId },
        type: "media-franchise.published",
      });
    }

    if (input.publicationStatus === "submitted") {
      await appendEvent({
        actorAuthorId: input.authorId,
        aggregateId: String(franchise.id),
        aggregateType: "franchise",
        payload: { authorId: input.authorId, franchiseId: franchise.id },
        type: "franchise.submitted",
      });
    }

    return franchise;
  });
}

export async function getAuthorFranchiseSubmissions(authorId: number) {
  const [standaloneFranchises, franchiseLinks] = await Promise.all([
    db
      .select({
        kind: sql<"franchise">`'franchise'`,
        id: franchises.id,
        franchiseCode: franchises.code,
        franchiseTitle: franchises.title,
        franchiseOriginalTitle: franchises.originalTitle,
        publicationStatus: franchises.publicationStatus,
        createdAt: franchises.createdAt,
        updatedAt: franchises.updatedAt,
      })
      .from(franchises)
      .where(
        and(
          eq(franchises.createdByAuthorId, authorId),
          inArray(franchises.publicationStatus, [...AUTHOR_FRANCHISE_SUBMISSION_STATUSES]),
          notExists(
            db
              .select({ franchiseId: mediaItemFranchises.franchiseId })
              .from(mediaItemFranchises)
              .where(
                and(
                  eq(mediaItemFranchises.franchiseId, franchises.id),
                  eq(mediaItemFranchises.createdByAuthorId, authorId),
                ),
              ),
          ),
        ),
      ),
    db
      .select({
        kind: sql<"link" | "new-franchise-link">`
          case
            when ${franchises.createdByAuthorId} = ${authorId} then 'new-franchise-link'
            else 'link'
          end
        `,
        id: mediaItemFranchises.mediaItemId,
        franchiseId: franchises.id,
        mediaItemCode: mediaItems.code,
        mediaItemTitle: mediaItems.title,
        mediaItemPublicationStatus: mediaItems.publicationStatus,
        franchiseCode: franchises.code,
        franchiseTitle: franchises.title,
        franchiseOriginalTitle: franchises.originalTitle,
        franchisePublicationStatus: franchises.publicationStatus,
        publicationStatus: mediaItemFranchises.publicationStatus,
        createdAt: mediaItemFranchises.createdAt,
        updatedAt: mediaItemFranchises.updatedAt,
      })
      .from(mediaItemFranchises)
      .innerJoin(mediaItems, eq(mediaItems.id, mediaItemFranchises.mediaItemId))
      .innerJoin(franchises, eq(franchises.id, mediaItemFranchises.franchiseId))
      .where(and(
        eq(mediaItemFranchises.createdByAuthorId, authorId),
        inArray(
          mediaItemFranchises.publicationStatus,
          [...AUTHOR_FRANCHISE_SUBMISSION_STATUSES],
        ),
      )),
  ]);

  return [...standaloneFranchises, ...franchiseLinks].sort((left, right) => {
    const createdAtDifference = right.createdAt.getTime() - left.createdAt.getTime();

    if (createdAtDifference !== 0) {
      return createdAtDifference;
    }

    return left.franchiseTitle.localeCompare(right.franchiseTitle, "ru");
  });
}

export async function createFranchise(input: {
  code: string;
  title: string;
  originalTitle: string | null;
  description: string | null;
  createdByAuthorId?: number | null;
  publicationStatus?: "private" | "submitted" | "published" | "rejected";
  parentId?: number | null;
}) {
  if (input.parentId) {
    const [settings, rows] = await Promise.all([getArchiveSettings(), db.select({ id: franchises.id, parentId: franchises.parentId }).from(franchises)]);
    const parents = new Map(rows.map((row) => [row.id, row.parentId]));
    let depth = 1; let parentId: number | null = input.parentId;
    while (parentId) { depth += 1; parentId = parents.get(parentId) ?? null; }
    if (depth > settings.maxFranchiseDepth) throw new Error("franchise-depth-limit");
  }
  const [franchise] = await db
    .insert(franchises)
    .values({
      ...input,
      publicationStatus: input.publicationStatus ?? PUBLISHED_PUBLICATION_STATUS,
    })
    .returning({
      id: franchises.id,
      code: franchises.code,
      title: franchises.title,
      originalTitle: franchises.originalTitle,
      publicationStatus: franchises.publicationStatus,
    });

  return franchise;
}

export async function updateFranchise(input: {
  id: number;
  title: string;
  originalTitle: string | null;
  description: string | null;
  parentId: number | null;
}) {
  return runInDomainEventTransaction(async (tx, appendEvent) => {
    await tx.execute(sql`select pg_advisory_xact_lock(58391038)`);
    const allFranchises = await tx.select({ id: franchises.id, parentId: franchises.parentId }).from(franchises);
    const { maxFranchiseDepth } = await getArchiveSettings();
    const parent = input.parentId === null ? null : allFranchises.find((franchise) => franchise.id === input.parentId);
    if (input.parentId !== null && !parent) throw new Error("invalid-franchise-parent");
    let ancestorId = input.parentId;
    while (ancestorId) {
      if (ancestorId === input.id) throw new Error("franchise-parent-cycle");
      ancestorId = allFranchises.find((franchise) => franchise.id === ancestorId)?.parentId ?? null;
    }
    const parentById = new Map(allFranchises.map((franchise) => [franchise.id, franchise.parentId]));
    let targetDepth = 1; let targetParentId = input.parentId;
    while (targetParentId) { targetDepth += 1; targetParentId = parentById.get(targetParentId) ?? null; }
    const childIds = new Map<number, number[]>();
    for (const row of allFranchises) childIds.set(row.parentId ?? 0, [...(childIds.get(row.parentId ?? 0) ?? []), row.id]);
    const height = (id: number): number => 1 + Math.max(0, ...(childIds.get(id) ?? []).map(height));
    if (targetDepth + height(input.id) - 1 > maxFranchiseDepth) throw new Error("franchise-depth-limit");
    const previousParentId = allFranchises.find((item) => item.id === input.id)?.parentId ?? null;
    const [franchise] = await tx
    .update(franchises)
    .set({
      title: input.title,
      originalTitle: input.originalTitle,
      description: input.description,
      parentId: input.parentId,
      updatedAt: new Date(),
    })
    .where(eq(franchises.id, input.id))
    .returning({
      id: franchises.id,
      code: franchises.code,
      title: franchises.title,
    });

    if (!franchise) return null;
    await tx.execute(sql`
      with recursive ancestor_links as (
        select id as ancestor_id, parent_id, id as descendant_id from ${franchises}
        union all
        select parent.id, parent.parent_id, ancestor_links.descendant_id
        from ${franchises} parent
        inner join ancestor_links on parent.id = ancestor_links.parent_id
      )
      delete from ${mediaItemFranchises} direct_link
      using ${mediaItemFranchises} descendant_link, ancestor_links
      where direct_link.media_item_id = descendant_link.media_item_id
        and direct_link.franchise_id = ancestor_links.ancestor_id
        and descendant_link.franchise_id = ancestor_links.descendant_id
        and ancestor_links.ancestor_id <> ancestor_links.descendant_id
    `);
    if (previousParentId !== input.parentId) {
      await appendEvent({
        actorAuthorId: null,
        aggregateId: String(franchise.id),
        aggregateType: "franchise",
        payload: {
          franchiseId: franchise.id,
          nextParentId: input.parentId,
          previousParentId,
        },
        type: "franchise.parent.changed",
      });
    }
    return franchise;
  });
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
        notExists(
          db.select({ id: franchises.id }).from(franchises).where(eq(franchises.parentId, id)),
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

export async function getMediaItemsByFranchiseId(
  franchiseId: number,
  enabledMediaTypeCodes: readonly string[],
  currentAuthorId?: number,
) {
  const items = await db
    .select({
      id: mediaItems.id,
      code: mediaItems.code,
      title: mediaItems.title,
      originalTitle: mediaItems.originalTitle,
      aliases: mediaItemTitleAliasesSql(),
      description: mediaItems.description,
      mediaType: mediaItems.mediaType,
      mediaCarrierCode: mediaCarriers.code,
      mediaCarrierName: mediaCarriers.name,
      releaseYear: mediaItems.releaseYear,
      coverUrl: mediaItems.coverUrl,
      coverThumbUrl: mediaItems.coverThumbUrl,
      averageScore: mediaItemAverageScoreSql,
      ratingsCount: mediaItemRatingsCountSql,
      currentAuthorScore: currentAuthorScoreSql(currentAuthorId),
      currentAuthorStatus: currentAuthorStatusSql(currentAuthorId),
      hasDirectFranchiseLink: sql<boolean>`bool_or(${mediaItemFranchises.franchiseId} = ${franchiseId})`,
    })
    .from(mediaItems)
    .innerJoin(mediaItemFranchises, eq(mediaItemFranchises.mediaItemId, mediaItems.id))
    .innerJoin(franchises, eq(franchises.id, mediaItemFranchises.franchiseId))
    .leftJoin(mediaCarriers, eq(mediaCarriers.id, mediaItems.mediaCarrierId))
    .leftJoin(mediaItemRatingStats, eq(mediaItemRatingStats.mediaItemId, mediaItems.id))
    .where(
      and(
        sql`${mediaItemFranchises.franchiseId} in (${publishedFranchiseBranchIdsSql(franchiseId)})`,
        eq(mediaItemFranchises.publicationStatus, PUBLISHED_PUBLICATION_STATUS),
        publishedFranchiseCondition,
        publishedMediaItemCondition,
        getMediaTypeCodeFilterSql(mediaItems.mediaType, enabledMediaTypeCodes),
      ),
    )
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
      mediaItemRatingStats.ratingsCount,
      mediaItemRatingStats.scoreSum,
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
      aliases: mediaItemTitleAliasesSql(),
      mediaType: mediaItems.mediaType,
      coverUrl: mediaItems.coverUrl,
      coverThumbUrl: mediaItems.coverThumbUrl,
      releaseYear: mediaItems.releaseYear,
      publicationStatus: mediaItems.publicationStatus,
      franchisePublicationStatus: mediaItemFranchises.publicationStatus,
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
      aliases: mediaItemTitleAliasesSql(),
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
  return runInDomainEventTransaction(async (tx, appendEvent) => {
    const [mediaItem, franchise] = await Promise.all([
      tx.select({ id: mediaItems.id }).from(mediaItems).where(eq(mediaItems.id, input.mediaItemId)).limit(1),
      tx.select({ id: franchises.id }).from(franchises).where(eq(franchises.id, input.franchiseId)).limit(1),
    ]);
    if (!mediaItem || !franchise) return null;

    const [existingLinks, allFranchises] = await Promise.all([
      tx.select({ franchiseId: mediaItemFranchises.franchiseId })
        .from(mediaItemFranchises)
        .where(eq(mediaItemFranchises.mediaItemId, input.mediaItemId)),
      tx.select({ id: franchises.id, parentId: franchises.parentId }).from(franchises),
    ]);
    const parentById = new Map(allFranchises.map((row) => [row.id, row.parentId]));
    const selectedIds = [...new Set([...existingLinks.map((link) => link.franchiseId), input.franchiseId])];
    const redundantIds = selectedIds.filter((id) => selectedIds.some((candidateId) => {
      let parentId = parentById.get(candidateId) ?? null;
      while (parentId) {
        if (parentId === id) return true;
        parentId = parentById.get(parentId) ?? null;
      }
      return false;
    }));
    const inputIsRedundant = redundantIds.includes(input.franchiseId);
    const existingFranchiseIds = new Set(existingLinks.map((link) => link.franchiseId));
    const existingRedundantIds = redundantIds.filter((id) => existingFranchiseIds.has(id));
    if (existingRedundantIds.length > 0) {
      await tx.delete(mediaItemFranchises).where(and(
        eq(mediaItemFranchises.mediaItemId, input.mediaItemId),
        inArray(mediaItemFranchises.franchiseId, existingRedundantIds),
      ));
    }
    if (!inputIsRedundant) {
      await tx.insert(mediaItemFranchises).values({
        mediaItemId: input.mediaItemId,
        franchiseId: input.franchiseId,
      }).onConflictDoNothing();
    }

    const [updatedMediaItem] = await tx.update(mediaItems)
      .set({ updatedAt: new Date() })
      .where(eq(mediaItems.id, input.mediaItemId))
      .returning({ id: mediaItems.id, code: mediaItems.code, title: mediaItems.title });
    if (updatedMediaItem && !inputIsRedundant && !existingFranchiseIds.has(input.franchiseId)) {
      await appendEvent({
        actorAuthorId: null,
        aggregateId: `${input.mediaItemId}:${input.franchiseId}`,
        aggregateType: "media-franchise",
        payload: input,
        type: "media-franchise.published",
      });
    }
    return updatedMediaItem ?? null;
  });
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
