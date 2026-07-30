import { and, asc, desc, eq, exists, inArray, isNull, ne, notExists, or, sql } from "drizzle-orm";

import { db } from "@/db";
import { getMediaTypeCodeFilterSql } from "@/db/queries/media-types";
import { authors, franchises, mediaCarriers, mediaItemFranchiseRemovalRequests, mediaItemFranchises, mediaItemTitleAliases, mediaItems, ratings } from "@/db/schema";
import { clampPage, getOffset, getTotalPages } from "@/lib/common/pagination";
import { PUBLISHED_PUBLICATION_STATUS } from "@/lib/media/publication-status";
import { resolveCoverUrl } from "@/lib/services/minio";
import { getArchiveSettings } from "@/db/queries/archive-settings";
import { AUTHOR_FRANCHISE_SUBMISSION_STATUSES } from "@/lib/authors/franchise-submission-filters";

const publishedMediaItemCondition = eq(
  mediaItems.publicationStatus,
  PUBLISHED_PUBLICATION_STATUS,
);
const publishedFranchiseCondition = eq(
  franchises.publicationStatus,
  PUBLISHED_PUBLICATION_STATUS,
);

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
  const rows = await db
    .select({
      id: franchises.id,
      parentId: franchises.parentId,
      title: franchises.title,
      originalTitle: franchises.originalTitle,
      publicationStatus: franchises.publicationStatus,
    })
    .from(franchises)
    .orderBy(asc(franchises.title), asc(franchises.code));
  const rowsById = new Map(rows.map((row) => [row.id, row]));

  return rows.map((row) => {
    const parentIds: number[] = [];
    const path = [row.title];
    let parentId = row.parentId;

    while (parentId) {
      const parent = rowsById.get(parentId);

      if (!parent) {
        break;
      }

      parentIds.unshift(parent.id);
      path.unshift(parent.title);
      parentId = parent.parentId;
    }

    return {
      id: row.id,
      title: row.title,
      originalTitle: row.originalTitle,
      publicationStatus: row.publicationStatus,
      parentIds,
      path: path.join(" / "),
    };
  });
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
      id: franchises.id,
      title: franchises.title,
      originalTitle: franchises.originalTitle,
      publicationStatus: franchises.publicationStatus,
    })
    .from(franchises)
    .where(publishedFranchiseCondition)
    .orderBy(asc(franchises.title));
}

export async function getPublishedFranchiseOptionById(id: number) {
  const [franchise] = await db
    .select({
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
  const normalizedSearchQuery = input.searchQuery.trim().toLowerCase();

  if (normalizedSearchQuery.length < 2) {
    return [];
  }

  const pattern = `%${normalizedSearchQuery}%`;
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
          sql`lower(${mediaItems.title}) like ${pattern}`,
          sql`lower(${mediaItems.originalTitle}) like ${pattern}`,
          sql`('-' || lower(${mediaItems.code}) || '-') like ${codePattern}`,
          exists(
            db
              .select({ id: mediaItemTitleAliases.id })
              .from(mediaItemTitleAliases)
              .where(
                and(
                  eq(mediaItemTitleAliases.mediaItemId, mediaItems.id),
                  sql`lower(${mediaItemTitleAliases.value}) like ${pattern}`,
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

export async function getPublishedFranchiseTree(
  searchQuery: string,
  enabledMediaTypeCodes: readonly string[],
) {
  const rows = await db
    .select({
      id: franchises.id,
      parentId: franchises.parentId,
      code: franchises.code,
      title: franchises.title,
      originalTitle: franchises.originalTitle,
    })
    .from(franchises)
    .where(publishedFranchiseCondition)
    .orderBy(asc(franchises.title), asc(franchises.code));
  const links = await db
    .select({ franchiseId: mediaItemFranchises.franchiseId, mediaItemId: mediaItemFranchises.mediaItemId })
    .from(mediaItemFranchises)
    .innerJoin(mediaItems, eq(mediaItems.id, mediaItemFranchises.mediaItemId))
    .where(and(
      eq(mediaItemFranchises.publicationStatus, PUBLISHED_PUBLICATION_STATUS),
      publishedMediaItemCondition,
      getMediaTypeCodeFilterSql(mediaItems.mediaType, enabledMediaTypeCodes),
    ));
  const normalizedSearch = searchQuery.trim().toLowerCase();
  const matches = new Set(rows.filter((row) => !normalizedSearch || [row.title, row.originalTitle, row.code]
    .filter(Boolean).join(" ").toLowerCase().includes(normalizedSearch)).map((row) => row.id));
  const rowById = new Map(rows.map((row) => [row.id, row]));
  const childrenByParentId = new Map<number | null, number[]>();

  for (const row of rows) {
    childrenByParentId.set(row.parentId, [
      ...(childrenByParentId.get(row.parentId) ?? []),
      row.id,
    ]);
  }

  if (normalizedSearch) {
    for (const id of [...matches]) {
      let parentId = rowById.get(id)?.parentId ?? null;
      while (parentId) {
        matches.add(parentId);
        parentId = rowById.get(parentId)?.parentId ?? null;
      }

      const descendantIds = [...(childrenByParentId.get(id) ?? [])];

      while (descendantIds.length > 0) {
        const descendantId = descendantIds.pop()!;

        matches.add(descendantId);
        descendantIds.push(...(childrenByParentId.get(descendantId) ?? []));
      }
    }
  }

  const nodes = new Map<number, FranchiseTreeNode>();
  for (const row of rows) {
    if (!normalizedSearch || matches.has(row.id)) {
      nodes.set(row.id, { ...row, mediaItemsCount: 0, children: [] });
    }
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
    .map((value) => value?.trim().replace(/\s+/g, " ").toLowerCase() ?? "")
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
      sql`lower(regexp_replace(trim(${franchises.title}), '\\s+', ' ', 'g')) = ${searchTerm}`,
      sql`lower(regexp_replace(trim(coalesce(${franchises.originalTitle}, '')), '\\s+', ' ', 'g')) = ${searchTerm}`,
    ]),
  );
  const similarCondition = or(
    ...searchTerms.flatMap((searchTerm) => {
      const pattern = `%${searchTerm}%`;

      return [
        sql`lower(${franchises.title}) like ${pattern}`,
        sql`lower(${franchises.originalTitle}) like ${pattern}`,
        sql`lower(${franchises.code}) like ${pattern}`,
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
  const rows = await db
    .select({
      id: franchises.id,
      parentId: franchises.parentId,
      code: franchises.code,
      title: franchises.title,
      originalTitle: franchises.originalTitle,
      mediaItemsCount: sql<number>`count(${mediaItemFranchises.mediaItemId})::int`,
      publicationStatus: franchises.publicationStatus,
    })
    .from(franchises)
    .leftJoin(mediaItemFranchises, eq(mediaItemFranchises.franchiseId, franchises.id))
    .groupBy(
      franchises.id,
      franchises.parentId,
      franchises.code,
      franchises.title,
      franchises.originalTitle,
      franchises.publicationStatus,
    )
    .orderBy(asc(franchises.title), asc(franchises.code));
  const normalizedSearchQuery = searchQuery.trim().toLowerCase();
  const rowsById = new Map(rows.map((row) => [row.id, row]));
  const childrenByParentId = new Map<number | null, number[]>();

  for (const row of rows) {
    childrenByParentId.set(row.parentId, [
      ...(childrenByParentId.get(row.parentId) ?? []),
      row.id,
    ]);
  }

  const visibleIds = new Set(
    rows
      .filter((row) => !normalizedSearchQuery || [row.title, row.originalTitle, row.code]
        .filter(Boolean)
        .join(" ")
        .toLowerCase()
        .includes(normalizedSearchQuery))
      .map((row) => row.id),
  );

  if (normalizedSearchQuery) {
    for (const id of [...visibleIds]) {
      let parentId = rowsById.get(id)?.parentId ?? null;

      while (parentId) {
        visibleIds.add(parentId);
        parentId = rowsById.get(parentId)?.parentId ?? null;
      }

      const descendantIds = [...(childrenByParentId.get(id) ?? [])];

      while (descendantIds.length > 0) {
        const descendantId = descendantIds.pop()!;

        visibleIds.add(descendantId);
        descendantIds.push(...(childrenByParentId.get(descendantId) ?? []));
      }
    }
  }

  const nodesById = new Map<number, AdminFranchiseTreeNode>();

  for (const row of rows) {
    if (!normalizedSearchQuery || visibleIds.has(row.id)) {
      nodesById.set(row.id, { ...row, children: [] });
    }
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

  return { items: roots, totalCount: rows.length };
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
    .select({ id: franchises.id, parentId: franchises.parentId, title: franchises.title, originalTitle: franchises.originalTitle })
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
    id: row.id, title: row.title, originalTitle: row.originalTitle, path: getPath(row),
  }));
}

export async function getAdminFranchiseChildCandidates(franchiseId: number) {
  const rows = await db.select({ id: franchises.id, parentId: franchises.parentId, title: franchises.title, originalTitle: franchises.originalTitle }).from(franchises).orderBy(asc(franchises.title));
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
  return rows.filter((row) => !related.has(row.id)).map((row) => ({ id: row.id, title: row.title, originalTitle: row.originalTitle, path: path(row) }));
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
  return db.transaction(async (tx) => {
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
      await tx
        .update(mediaItemFranchises)
        .set({ publicationStatus: input.decision, updatedAt: new Date() })
        .where(
          and(
            eq(mediaItemFranchises.franchiseId, franchise.id),
            eq(mediaItemFranchises.createdByAuthorId, franchise.createdByAuthorId),
            eq(mediaItemFranchises.publicationStatus, "submitted"),
          ),
        );
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
  const [link] = await db
    .update(mediaItemFranchises)
    .set({ publicationStatus: input.decision, updatedAt: new Date() })
    .where(
      and(
        eq(mediaItemFranchises.mediaItemId, input.mediaItemId),
        eq(mediaItemFranchises.franchiseId, input.franchiseId),
        eq(mediaItemFranchises.publicationStatus, "submitted"),
        exists(
          db
            .select({ id: mediaItems.id })
            .from(mediaItems)
            .where(and(eq(mediaItems.id, input.mediaItemId), publishedMediaItemCondition)),
        ),
        exists(
          db
            .select({ id: franchises.id })
            .from(franchises)
            .where(and(eq(franchises.id, input.franchiseId), publishedFranchiseCondition)),
        ),
      ),
    )
    .returning({ mediaItemId: mediaItemFranchises.mediaItemId, franchiseId: mediaItemFranchises.franchiseId });

  return link ?? null;
}

export async function reviewMediaItemFranchiseRemovalRequest(input: {
  decision: "published" | "rejected";
  franchiseId: number;
  mediaItemId: number;
}) {
  return db.transaction(async (tx) => {
    if (input.decision === "published") {
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
  return db.transaction(async (tx) => {
    const franchiseIds = [...new Set(input.franchiseIds)];

    if (franchiseIds.length === 0) {
      return null;
    }

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

    return franchiseIds.map((franchiseId) => availableFranchisesById.get(franchiseId)!);
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
  return db.transaction(async (tx) => {
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
    await tx.insert(mediaItemFranchiseRemovalRequests).values({
      mediaItemId: input.mediaItemId,
      franchiseId: input.franchiseId,
      requestedByAuthorId: input.authorId,
    }).onConflictDoNothing();
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
  return db.transaction(async (tx) => {
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
  return db.transaction(async (tx) => {
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
      averageScore: sql<number | null>`avg(${ratings.score})::float`,
      ratingsCount: sql<number>`count(${ratings.id})::int`,
      currentAuthorScore: currentAuthorScoreSql(currentAuthorId),
      hasDirectFranchiseLink: sql<boolean>`bool_or(${mediaItemFranchises.franchiseId} = ${franchiseId})`,
    })
    .from(mediaItems)
    .innerJoin(mediaItemFranchises, eq(mediaItemFranchises.mediaItemId, mediaItems.id))
    .innerJoin(franchises, eq(franchises.id, mediaItemFranchises.franchiseId))
    .leftJoin(mediaCarriers, eq(mediaCarriers.id, mediaItems.mediaCarrierId))
    .leftJoin(ratings, eq(ratings.mediaItemId, mediaItems.id))
    .where(
      and(
        sql`${mediaItemFranchises.franchiseId} in (
          with recursive descendants as (
            select ${franchises.id} from ${franchises} where ${franchises.id} = ${franchiseId}
            union all
            select child.id from "franchises" child
            inner join descendants on child.parent_id = descendants.id
            where child.publication_status = ${PUBLISHED_PUBLICATION_STATUS}
          )
          select id from descendants
        )`,
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
  return db.transaction(async (tx) => {
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
