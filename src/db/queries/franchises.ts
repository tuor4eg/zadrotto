import { and, asc, desc, eq, exists, inArray, notExists, or, sql, type SQL } from "drizzle-orm";

import { db } from "@/db";
import { authors, franchises, mediaCarriers, mediaItemFranchises, mediaItems, ratings } from "@/db/schema";
import { clampPage, getOffset, getTotalPages } from "@/lib/common/pagination";
import { PUBLISHED_PUBLICATION_STATUS } from "@/lib/media/publication-status";
import { resolveCoverUrl } from "@/lib/services/minio";

const publishedMediaItemCondition = eq(
  mediaItems.publicationStatus,
  PUBLISHED_PUBLICATION_STATUS,
);
const publishedFranchiseCondition = eq(
  franchises.publicationStatus,
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
    })
    .from(franchises)
    .where(
      and(
        eq(franchises.code, code),
        publishedFranchiseCondition,
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
                eq(mediaItemFranchises.publicationStatus, PUBLISHED_PUBLICATION_STATUS),
              ),
            ),
        ),
      ),
    )
    .limit(1);

  return franchise ?? null;
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
      publicationStatus: franchises.publicationStatus,
      createdByAuthorId: franchises.createdByAuthorId,
    })
    .from(franchises)
    .leftJoin(mediaItemFranchises, eq(mediaItemFranchises.franchiseId, franchises.id))
    .where(filterCondition)
    .groupBy(
      franchises.id,
      franchises.code,
      franchises.title,
      franchises.originalTitle,
      franchises.publicationStatus,
      franchises.createdByAuthorId,
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
      publicationStatus: franchises.publicationStatus,
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
  const [submittedFranchises, submittedLinks] = await Promise.all([
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
  ]);

  return [...submittedFranchises, ...submittedLinks].sort(
    (left, right) => right.createdAt.getTime() - left.createdAt.getTime(),
  );
}

export async function getSubmittedFranchisesCountForAdmin() {
  const [franchiseResult, linkResult] = await Promise.all([
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
  ]);

  return (franchiseResult[0]?.count ?? 0) + (linkResult[0]?.count ?? 0);
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

export async function createAuthorFranchiseWithMediaItemLink(input: {
  authorId: number;
  code: string;
  description: string | null;
  mediaItemId: number;
  originalTitle: string | null;
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
      .where(eq(mediaItemFranchises.createdByAuthorId, authorId)),
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
}) {
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
    .where(
      and(
        eq(mediaItemFranchises.franchiseId, franchiseId),
        eq(mediaItemFranchises.publicationStatus, PUBLISHED_PUBLICATION_STATUS),
        publishedMediaItemCondition,
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
