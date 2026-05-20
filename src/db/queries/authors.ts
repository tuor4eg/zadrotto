import { asc, eq, sql } from "drizzle-orm";

import { db } from "@/db";
import { authorAccessTokens, authorPermissions, authors, mediaItems, ratings } from "@/db/schema";

const authorUsageCountSql = sql<number>`(
  (select count(*) from ${authorAccessTokens} where ${authorAccessTokens.authorId} = ${authors.id}) +
  (select count(*) from ${authorPermissions} where ${authorPermissions.authorId} = ${authors.id}) +
  (select count(*) from ${ratings} where ${ratings.authorId} = ${authors.id}) +
  (select count(*) from ${mediaItems} where ${mediaItems.createdByAuthorId} = ${authors.id})
)::int`;

export async function getAuthors() {
  return db
    .select({
      id: authors.id,
      code: authors.code,
      name: authors.name,
      createdAt: authors.createdAt,
      blockedAt: authors.blockedAt,
      usageCount: authorUsageCountSql,
    })
    .from(authors)
    .orderBy(asc(authors.name), asc(authors.code));
}

export async function getAuthorById(id: number) {
  const [author] = await db
    .select({
      id: authors.id,
      code: authors.code,
      name: authors.name,
      blockedAt: authors.blockedAt,
    })
    .from(authors)
    .where(eq(authors.id, id))
    .limit(1);

  return author ?? null;
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
    .where(eq(authors.id, input.id))
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
      count: authorUsageCountSql,
    })
    .from(authors)
    .where(eq(authors.id, id))
    .limit(1);

  if (!usage || usage.count > 0) {
    return false;
  }

  const [author] = await db
    .delete(authors)
    .where(eq(authors.id, id))
    .returning({
      id: authors.id,
    });

  return Boolean(author);
}
