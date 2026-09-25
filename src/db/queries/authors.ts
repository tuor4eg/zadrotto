import { and, asc, desc, eq, isNotNull, isNull, sql } from "drizzle-orm";

import { db } from "@/db";
import {
  authorAccounts,
  authorAccessProfiles,
  authorAccessTokens,
  authorEmails,
  authorMediaExperiences,
  authorSessions,
  authors,
  bugReports,
  contributions,
  mediaItems,
  ratings,
} from "@/db/schema";
import { clampPage, getOffset, getTotalPages } from "@/lib/common/pagination";

export type DeleteAuthorResult =
  | { status: "deleted"; avatarObjectKey: string | null }
  | { status: "has-data" }
  | { status: "last-system-author" }
  | { status: "not-found" };
export type AuthorActivityFilter = "active" | "blocked";
export type AuthorSort = "name" | "created" | "activity" | "ratings" | "reviews";

export const ADMIN_AUTHORS_PAGE_SIZE = 25;

const authorHasUsageSql = sql<boolean>`(
  exists(select 1 from ${ratings} where ${ratings.authorId} = ${authors.id})
  or exists(select 1 from ${mediaItems} where ${mediaItems.createdByAuthorId} = ${authors.id})
  or exists(select 1 from ${contributions} where ${contributions.authorId} = ${authors.id})
  or exists(select 1 from ${bugReports} where ${bugReports.authorId} = ${authors.id})
)`;

function authorUsageCountByIdSql(authorId: number) {
  return sql<number>`(
    (select count(*) from ${ratings} where ${ratings.authorId} = ${authorId}) +
    (select count(*) from ${mediaItems} where ${mediaItems.createdByAuthorId} = ${authorId}) +
    (select count(*) from ${contributions} where ${contributions.authorId} = ${authorId}) +
    (select count(*) from ${bugReports} where ${bugReports.authorId} = ${authorId})
  )::int`;
}

function authorRatingsCountSql(authorId: typeof authors.id) {
  return sql<number>`(
    select count(*) from ${ratings} where ${ratings.authorId} = ${authorId}
  )::int`;
}

function authorReviewsCountSql(authorId: typeof authors.id) {
  return sql<number>`(
    select count(*) from ${contributions}
    where ${contributions.authorId} = ${authorId}
      and ${contributions.type} = 'review'
  )::int`;
}

function authorLastActivityAtSql(
  authorId: typeof authors.id,
  createdAt: typeof authors.createdAt,
) {
  return sql<Date>`greatest(
    ${createdAt},
    coalesce(
      (select max(${mediaItems.updatedAt}) from ${mediaItems}
       where ${mediaItems.createdByAuthorId} = ${authorId}),
      ${createdAt}
    ),
    coalesce(
      (select max(${ratings.updatedAt}) from ${ratings}
       where ${ratings.authorId} = ${authorId}),
      ${createdAt}
    ),
    coalesce(
      (select max(${contributions.updatedAt}) from ${contributions}
       where ${contributions.authorId} = ${authorId}
         and ${contributions.type} = 'review'),
      ${createdAt}
    ),
    coalesce(
      (select max(${authorSessions.lastSeenAt}) from ${authorSessions}
       where ${authorSessions.authorId} = ${authorId}),
      ${createdAt}
    )
  )::timestamptz`.mapWith(createdAt);
}

export async function getAuthors(input: {
  accessProfileId?: number | null;
  activity?: AuthorActivityFilter | "all";
  page: number;
  pageSize?: number;
  sort: AuthorSort;
}) {
  const activityCondition =
    input?.activity === "active"
      ? isNull(authors.blockedAt)
      : input?.activity === "blocked"
        ? isNotNull(authors.blockedAt)
        : undefined;
  const accessProfileCondition = input?.accessProfileId
    ? eq(authors.accessProfileId, input.accessProfileId)
    : undefined;
  const where = and(activityCondition, accessProfileCondition);
  const pageSize = input.pageSize ?? ADMIN_AUTHORS_PAGE_SIZE;
  const [{ totalCount }] = await db
    .select({ totalCount: sql<number>`count(*)::int` })
    .from(authors)
    .where(where);
  const totalPages = getTotalPages(totalCount, pageSize);
  const page = clampPage(input.page, totalPages);
  const lastActivityAt = authorLastActivityAtSql(authors.id, authors.createdAt)
    .as("last_activity_at");
  const ratingsCount = authorRatingsCountSql(authors.id).as("ratings_count");
  const reviewsCount = authorReviewsCountSql(authors.id).as("reviews_count");
  const sortOrder = {
    name: [asc(authors.name), asc(authors.code)],
    created: [desc(authors.createdAt), asc(authors.id)],
    activity: [desc(lastActivityAt), asc(authors.id)],
    ratings: [desc(ratingsCount), asc(authors.name), asc(authors.id)],
    reviews: [desc(reviewsCount), asc(authors.name), asc(authors.id)],
  }[input.sort];

  const items = await db
    .select({
      id: authors.id,
      code: authors.code,
      name: authors.name,
      avatarObjectKey: authors.avatarObjectKey,
      isSystem: authors.isSystem,
      isDiscoverable: authors.isDiscoverable,
      accessProfileId: authorAccessProfiles.id,
      accessProfileName: authorAccessProfiles.name,
      createdAt: authors.createdAt,
      blockedAt: authors.blockedAt,
      lastActivityAt,
      ratingsCount,
      reviewsCount,
      hasUsage: authorHasUsageSql,
    })
    .from(authors)
    .innerJoin(authorAccessProfiles, eq(authorAccessProfiles.id, authors.accessProfileId))
    .where(where)
    .orderBy(...sortOrder)
    .limit(pageSize)
    .offset(getOffset(page, pageSize));

  return { items, page, pageSize, totalCount, totalPages };
}

export async function getSystemAuthorsCount() {
  const [{ count }] = await db
    .select({ count: sql<number>`count(*)::int` })
    .from(authors)
    .where(eq(authors.isSystem, true));

  return count;
}

export async function getAuthorOptions() {
  return db
    .select({
      id: authors.id,
      name: authors.name,
      avatarObjectKey: authors.avatarObjectKey,
      isSystem: authors.isSystem,
      accessProfileName: authorAccessProfiles.name,
    })
    .from(authors)
    .innerJoin(authorAccessProfiles, eq(authorAccessProfiles.id, authors.accessProfileId))
    .orderBy(desc(authors.isSystem), asc(authors.name), asc(authors.code));
}

export async function getAuthorById(id: number) {
  const [author] = await db
    .select({
      id: authors.id,
      code: authors.code,
      name: authors.name,
      avatarObjectKey: authors.avatarObjectKey,
      isSystem: authors.isSystem,
      isDiscoverable: authors.isDiscoverable,
      accessProfileId: authors.accessProfileId,
      accessProfileCode: authorAccessProfiles.code,
      accessProfileName: authorAccessProfiles.name,
      canPublishMediaWithoutReview: authorAccessProfiles.canPublishMediaWithoutReview,
      canPublishFranchisesWithoutReview: authorAccessProfiles.canPublishFranchisesWithoutReview,
      maxDraftMediaItems: authorAccessProfiles.maxDraftMediaItems,
      maxDraftMediaItemsPerDay: authorAccessProfiles.maxDraftMediaItemsPerDay,
      maxUploadBytes: authorAccessProfiles.maxUploadBytes,
      maxFilesPerMediaItem: authorAccessProfiles.maxFilesPerMediaItem,
      coverSearchesPerMinute: authorAccessProfiles.coverSearchesPerMinute,
      coverSearchesPerHour: authorAccessProfiles.coverSearchesPerHour,
      coverSearchesPerDay: authorAccessProfiles.coverSearchesPerDay,
      blockedAt: authors.blockedAt,
    })
    .from(authors)
    .innerJoin(authorAccessProfiles, eq(authorAccessProfiles.id, authors.accessProfileId))
    .where(eq(authors.id, id))
    .limit(1);

  return author ?? null;
}

export async function getAdminAuthorProfileById(id: number) {
  const [author] = await db
    .select({
      id: authors.id,
      code: authors.code,
      name: authors.name,
      avatarObjectKey: authors.avatarObjectKey,
      isSystem: authors.isSystem,
      login: authorAccounts.login,
      email: authorEmails.email,
      accessProfileName: authorAccessProfiles.name,
      createdAt: authors.createdAt,
      blockedAt: authors.blockedAt,
      lastActivityAt: authorLastActivityAtSql(authors.id, authors.createdAt),
      createdMediaItemsCount: sql<number>`(
        select count(*) from ${mediaItems} where ${mediaItems.createdByAuthorId} = ${authors.id}
      )::int`,
      publishedMediaItemsCount: sql<number>`(
        select count(*) from ${mediaItems}
        where ${mediaItems.createdByAuthorId} = ${authors.id}
          and ${mediaItems.publicationStatus} = 'published'
      )::int`,
      ratingsCount: sql<number>`(
        select count(*) from ${ratings} where ${ratings.authorId} = ${authors.id}
      )::int`,
      reviewsCount: sql<number>`(
        select count(*) from ${contributions}
        where ${contributions.authorId} = ${authors.id}
          and ${contributions.type} = 'review'
      )::int`,
    })
    .from(authors)
    .innerJoin(authorAccessProfiles, eq(authorAccessProfiles.id, authors.accessProfileId))
    .leftJoin(authorAccounts, eq(authorAccounts.authorId, authors.id))
    .leftJoin(
      authorEmails,
      and(eq(authorEmails.authorId, authors.id), eq(authorEmails.isPrimary, true)),
    )
    .where(eq(authors.id, id))
    .limit(1);

  return author ?? null;
}

export async function authorExistsById(id: number) {
  const [author] = await db
    .select({
      id: authors.id,
    })
    .from(authors)
    .where(eq(authors.id, id))
    .limit(1);

  return Boolean(author);
}

export async function isAssignedAuthorAvatarObjectKey(objectKey: string) {
  const [author] = await db
    .select({ id: authors.id })
    .from(authors)
    .where(eq(authors.avatarObjectKey, objectKey))
    .limit(1);

  return Boolean(author);
}

export async function replaceAuthorAvatarObjectKey(input: {
  authorId: number;
  objectKey: string | null;
}) {
  return db.transaction(async (tx) => {
    const [existing] = await tx
      .select({ avatarObjectKey: authors.avatarObjectKey })
      .from(authors)
      .where(eq(authors.id, input.authorId))
      .limit(1)
      .for("update");

    if (!existing) return null;

    await tx
      .update(authors)
      .set({ avatarObjectKey: input.objectKey, updatedAt: new Date() })
      .where(eq(authors.id, input.authorId));

    return { previousObjectKey: existing.avatarObjectKey };
  });
}

export async function updateAuthorDisplayName(authorId: number, name: string) {
  const [author] = await db
    .update(authors)
    .set({ name, updatedAt: new Date() })
    .where(eq(authors.id, authorId))
    .returning({ id: authors.id, name: authors.name });

  return author ?? null;
}

export async function createAuthor(input: {
  code: string;
  name: string;
  accessProfileId: number;
}) {
  const [author] = await db
    .insert(authors)
    .values({
      name: input.name,
      code: input.code,
      accessProfileId: input.accessProfileId,
    })
    .returning({
      id: authors.id,
      code: authors.code,
    });

  return author;
}

export async function updateAuthor(input: {
  id: number;
  name: string;
  accessProfileId: number;
}) {
  const [author] = await db
    .update(authors)
    .set({
      name: input.name,
      accessProfileId: input.accessProfileId,
      updatedAt: new Date(),
    })
    .where(and(eq(authors.id, input.id), eq(authors.isSystem, false)))
    .returning({
      id: authors.id,
      code: authors.code,
    });

  return author ?? null;
}

export async function blockAuthor(input: {
  id: number;
  blockedByAdminId: number;
}) {
  const [author] = await db
    .update(authors)
    .set({
      blockedAt: new Date(),
      blockedByAdminId: input.blockedByAdminId,
      updatedAt: new Date(),
    })
    .where(eq(authors.id, input.id))
    .returning({
      id: authors.id,
    });

  return author ?? null;
}

export async function unblockAuthor(id: number) {
  const [author] = await db
    .update(authors)
    .set({
      blockedAt: null,
      blockedByAdminId: null,
      updatedAt: new Date(),
    })
    .where(eq(authors.id, id))
    .returning({
      id: authors.id,
    });

  return author ?? null;
}

export async function deleteAuthorIfUnused(id: number): Promise<DeleteAuthorResult> {
  const [usage] = await db
    .select({
      count: authorUsageCountByIdSql(id),
      isSystem: authors.isSystem,
    })
    .from(authors)
    .where(eq(authors.id, id))
    .limit(1);

  if (!usage) {
    return { status: "not-found" } satisfies DeleteAuthorResult;
  }

  if (usage.count > 0) {
    return { status: "has-data" } satisfies DeleteAuthorResult;
  }

  if (usage.isSystem) {
    const [systemAuthors] = await db
      .select({
        count: sql<number>`count(*)::int`,
      })
      .from(authors)
      .where(eq(authors.isSystem, true));

    if (!systemAuthors || systemAuthors.count <= 1) {
      return { status: "last-system-author" } satisfies DeleteAuthorResult;
    }
  }

  const author = await db.transaction(async (tx) => {
    await tx.delete(authorAccessTokens).where(eq(authorAccessTokens.authorId, id));
    await tx.delete(authorMediaExperiences).where(eq(authorMediaExperiences.authorId, id));

    const [deletedAuthor] = await tx
      .delete(authors)
      .where(eq(authors.id, id))
      .returning({
        id: authors.id,
        avatarObjectKey: authors.avatarObjectKey,
      });

    return deletedAuthor;
  });

  return author
    ? { status: "deleted", avatarObjectKey: author.avatarObjectKey }
    : { status: "not-found" };
}
