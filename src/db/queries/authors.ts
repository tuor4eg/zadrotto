import { and, asc, desc, eq, sql } from "drizzle-orm";

import { db } from "@/db";
import { authorAccessTokens, authorPermissions, authors, mediaItems, ratings } from "@/db/schema";

export type DeleteAuthorResult =
  | "deleted"
  | "has-data"
  | "last-system-author"
  | "not-found";

const authorUsageCountSql = sql<number>`(
  count(distinct ${authorPermissions.id}) +
  count(distinct ${ratings.id}) +
  count(distinct ${mediaItems.id})
)::int`;

function authorUsageCountByIdSql(authorId: number) {
  return sql<number>`(
    (select count(*) from ${authorPermissions} where ${authorPermissions.authorId} = ${authorId}) +
    (select count(*) from ${ratings} where ${ratings.authorId} = ${authorId}) +
    (select count(*) from ${mediaItems} where ${mediaItems.createdByAuthorId} = ${authorId})
  )::int`;
}

export async function getAuthors() {
  return db
    .select({
      id: authors.id,
      code: authors.code,
      name: authors.name,
      isSystem: authors.isSystem,
      createdAt: authors.createdAt,
      blockedAt: authors.blockedAt,
      usageCount: authorUsageCountSql,
    })
    .from(authors)
    .leftJoin(authorPermissions, eq(authorPermissions.authorId, authors.id))
    .leftJoin(ratings, eq(ratings.authorId, authors.id))
    .leftJoin(mediaItems, eq(mediaItems.createdByAuthorId, authors.id))
    .groupBy(
      authors.id,
      authors.code,
      authors.name,
      authors.isSystem,
      authors.createdAt,
      authors.blockedAt,
    )
    .orderBy(desc(authors.isSystem), asc(authors.name), asc(authors.code));
}

export async function getAuthorOptions() {
  return db
    .select({
      id: authors.id,
      name: authors.name,
      isSystem: authors.isSystem,
    })
    .from(authors)
    .orderBy(desc(authors.isSystem), asc(authors.name), asc(authors.code));
}

export async function getAuthorById(id: number) {
  const [author] = await db
    .select({
      id: authors.id,
      code: authors.code,
      name: authors.name,
      isSystem: authors.isSystem,
      blockedAt: authors.blockedAt,
    })
    .from(authors)
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

export async function createAuthor(input: {
  code: string;
  name: string;
}) {
  const [author] = await db
    .insert(authors)
    .values({
      name: input.name,
      code: input.code,
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
}) {
  const [author] = await db
    .update(authors)
    .set({
      name: input.name,
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

export async function deleteAuthorIfUnused(id: number) {
  const [usage] = await db
    .select({
      count: authorUsageCountByIdSql(id),
      isSystem: authors.isSystem,
    })
    .from(authors)
    .where(eq(authors.id, id))
    .limit(1);

  if (!usage) {
    return "not-found" satisfies DeleteAuthorResult;
  }

  if (usage.count > 0) {
    return "has-data" satisfies DeleteAuthorResult;
  }

  if (usage.isSystem) {
    const [systemAuthors] = await db
      .select({
        count: sql<number>`count(*)::int`,
      })
      .from(authors)
      .where(eq(authors.isSystem, true));

    if (!systemAuthors || systemAuthors.count <= 1) {
      return "last-system-author" satisfies DeleteAuthorResult;
    }
  }

  const author = await db.transaction(async (tx) => {
    await tx.delete(authorAccessTokens).where(eq(authorAccessTokens.authorId, id));

    const [deletedAuthor] = await tx
      .delete(authors)
      .where(eq(authors.id, id))
      .returning({
        id: authors.id,
      });

    return deletedAuthor;
  });

  return author ? "deleted" : "not-found";
}
