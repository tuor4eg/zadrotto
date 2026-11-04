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
  const [author] = await db
    .select({
      id: authors.id,
    })
    .from(authors)
    .where(and(eq(authors.id, input.authorId), eq(authors.isSystem, false)))
    .limit(1);

  if (!author) {
    return false;
  }

  await db.insert(authorAccessTokens).values(input);
  return true;
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
        eq(authors.isSystem, false),
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

async function mutateAuthorAccessToken(id: number, action: "revoke" | "restore" | "delete") {
  return db.transaction(async (tx) => {
    const [token] = await tx.select({ authorId: authorAccessTokens.authorId }).from(authorAccessTokens).where(eq(authorAccessTokens.id, id));
    if (!token) return;
    await tx.select({ id: authors.id }).from(authors).where(eq(authors.id, token.authorId)).for("update");
    if (action === "delete") {
      await tx.delete(authorAccessTokens).where(eq(authorAccessTokens.id, id));
    } else {
      await tx.update(authorAccessTokens).set({ revokedAt: action === "restore" ? null : new Date() }).where(eq(authorAccessTokens.id, id));
    }
  });
}
export async function revokeAuthorAccessToken(id: number) {
  await mutateAuthorAccessToken(id, "revoke");
}
export async function restoreAuthorAccessToken(id: number) {
  await mutateAuthorAccessToken(id, "restore");
}
export async function deleteAuthorAccessToken(id: number) {
  await mutateAuthorAccessToken(id, "delete");
}
