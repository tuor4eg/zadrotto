import { and, asc, desc, eq, isNotNull, isNull, sql } from "drizzle-orm";

import { db } from "@/db";
import {
  authorAccounts,
  authorAccessProfiles,
  authorAccessTokens,
  authorEmails,
  authors,
  mediaItems,
  ratings,
} from "@/db/schema";

export type DeleteAuthorResult =
  | { status: "deleted"; avatarObjectKey: string | null }
  | { status: "has-data" }
  | { status: "last-system-author" }
  | { status: "not-found" };
export type AuthorActivityFilter = "active" | "blocked";

const authorHasUsageSql = sql<boolean>`(
  exists(select 1 from ${ratings} where ${ratings.authorId} = ${authors.id})
  or exists(select 1 from ${mediaItems} where ${mediaItems.createdByAuthorId} = ${authors.id})
)`;

function authorUsageCountByIdSql(authorId: number) {
  return sql<number>`(
    (select count(*) from ${ratings} where ${ratings.authorId} = ${authorId}) +
    (select count(*) from ${mediaItems} where ${mediaItems.createdByAuthorId} = ${authorId})
  )::int`;
}

export async function getAuthors(input?: {
  accessProfileId?: number | null;
  activity?: AuthorActivityFilter | "all";
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

  return db
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
      hasUsage: authorHasUsageSql,
    })
    .from(authors)
    .innerJoin(authorAccessProfiles, eq(authorAccessProfiles.id, authors.accessProfileId))
    .where(and(activityCondition, accessProfileCondition))
    .orderBy(desc(authors.isSystem), asc(authors.name), asc(authors.code));
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
      lastActivityAt: sql<Date>`greatest(
        ${authors.createdAt},
        coalesce(
          (select max(${mediaItems.updatedAt}) from ${mediaItems} where ${mediaItems.createdByAuthorId} = ${authors.id}),
          ${authors.createdAt}
        ),
        coalesce(
          (select max(${ratings.updatedAt}) from ${ratings} where ${ratings.authorId} = ${authors.id}),
          ${authors.createdAt}
        )
      )::timestamptz`,
      createdMediaItemsCount: sql<number>`(
        select count(*) from ${mediaItems} where ${mediaItems.createdByAuthorId} = ${authors.id}
      )::int`,
      publishedMediaItemsCount: sql<number>`(
        select count(*) from ${mediaItems}
        where ${mediaItems.createdByAuthorId} = ${authors.id}
          and ${mediaItems.publicationStatus} = 'published'
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
