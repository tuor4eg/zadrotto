import { and, asc, eq, isNull } from "drizzle-orm";

import { db } from "@/db";
import { authorAccessTokens, authors } from "@/db/schema";

export async function getAuthorAccessTokens() {
  return db
    .select({
      id: authorAccessTokens.id,
      label: authorAccessTokens.label,
      createdAt: authorAccessTokens.createdAt,
      lastUsedAt: authorAccessTokens.lastUsedAt,
      revokedAt: authorAccessTokens.revokedAt,
      authorName: authors.name,
      authorCode: authors.code,
    })
    .from(authorAccessTokens)
    .innerJoin(authors, eq(authors.id, authorAccessTokens.authorId))
    .orderBy(asc(authors.name), asc(authorAccessTokens.createdAt));
}

export async function createAuthorAccessToken(input: {
  authorId: number;
  tokenHash: string;
  label: string;
  createdByAdminId: number;
}) {
  await db.insert(authorAccessTokens).values(input);
}

export async function getAuthorByAccessTokenHash(tokenHash: string) {
  const [accessToken] = await db
    .select({
      id: authorAccessTokens.id,
      authorId: authors.id,
      authorName: authors.name,
      authorCode: authors.code,
    })
    .from(authorAccessTokens)
    .innerJoin(authors, eq(authors.id, authorAccessTokens.authorId))
    .where(
      and(
        eq(authorAccessTokens.tokenHash, tokenHash),
        isNull(authorAccessTokens.revokedAt),
        isNull(authors.blockedAt),
      ),
    )
    .limit(1);

  return accessToken ?? null;
}

export async function updateAuthorAccessTokenLastUsedAt(id: number) {
  await db
    .update(authorAccessTokens)
    .set({
      lastUsedAt: new Date(),
    })
    .where(eq(authorAccessTokens.id, id));
}

export async function revokeAuthorAccessToken(id: number) {
  await db
    .update(authorAccessTokens)
    .set({
      revokedAt: new Date(),
    })
    .where(and(eq(authorAccessTokens.id, id), isNull(authorAccessTokens.revokedAt)));
}

export async function restoreAuthorAccessToken(id: number) {
  await db
    .update(authorAccessTokens)
    .set({
      revokedAt: null,
    })
    .where(eq(authorAccessTokens.id, id));
}

export async function deleteAuthorAccessToken(id: number) {
  await db.delete(authorAccessTokens).where(eq(authorAccessTokens.id, id));
}
