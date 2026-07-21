import { and, asc, eq, gt, isNotNull, isNull, lte, or, sql } from "drizzle-orm";

import { db } from "@/db";
import {
  authorAccounts,
  authorAuthChallenges,
  authorAuthIdentities,
  authorEmails,
  authorSessions,
  authors,
} from "@/db/schema";
import type {
  AuthorAccountStatus,
  AuthorAuthChallengePurpose,
  AuthorAuthMethod,
} from "@/lib/auth/author-account-model";

export async function getAuthorAccountByNormalizedLogin(normalizedLogin: string) {
  const [account] = await db
    .select()
    .from(authorAccounts)
    .where(eq(authorAccounts.normalizedLogin, normalizedLogin))
    .limit(1);

  return account ?? null;
}

export async function getAuthorAccountByAuthorId(authorId: number) {
  const [account] = await db
    .select()
    .from(authorAccounts)
    .where(eq(authorAccounts.authorId, authorId))
    .limit(1);
  return account ?? null;
}

export async function getAuthorProfileAccountState(authorId: number) {
  const [state] = await db
    .select({
      login: authorAccounts.login,
      status: authorAccounts.status,
      primaryEmail: authorEmails.email,
      emailVerifiedAt: authorEmails.verifiedAt,
    })
    .from(authors)
    .leftJoin(authorAccounts, eq(authorAccounts.authorId, authors.id))
    .leftJoin(authorEmails, and(
      eq(authorEmails.authorId, authors.id),
      eq(authorEmails.isPrimary, true),
    ))
    .where(eq(authors.id, authorId))
    .limit(1);

  return state ?? null;
}

export async function getAuthorSessions(authorId: number) {
  return db
    .select({
      id: authorSessions.id,
      authMethod: authorSessions.authMethod,
      createdAt: authorSessions.createdAt,
      lastSeenAt: authorSessions.lastSeenAt,
      expiresAt: authorSessions.expiresAt,
      ipAddress: authorSessions.ipAddress,
      userAgent: authorSessions.userAgent,
    })
    .from(authorSessions)
    .where(and(eq(authorSessions.authorId, authorId), isNull(authorSessions.revokedAt)))
    .orderBy(asc(authorSessions.createdAt));
}

export async function revokeAuthorSessionById(authorId: number, sessionId: number, now = new Date()) {
  const [session] = await db
    .update(authorSessions)
    .set({ revokedAt: now })
    .where(and(
      eq(authorSessions.id, sessionId),
      eq(authorSessions.authorId, authorId),
      isNull(authorSessions.revokedAt),
    ))
    .returning({ id: authorSessions.id });
  return Boolean(session);
}

export async function revokeAllAuthorSessions(authorId: number, exceptId?: number, now = new Date()) {
  await db
    .update(authorSessions)
    .set({ revokedAt: now })
    .where(and(
      eq(authorSessions.authorId, authorId),
      isNull(authorSessions.revokedAt),
      exceptId ? sql`${authorSessions.id} <> ${exceptId}` : undefined,
    ));
}

export async function getActiveAuthorAccountByLoginOrEmail(normalizedIdentity: string) {
  const [account] = await db
    .select({
      authorId: authorAccounts.authorId,
      passwordHash: authorAccounts.passwordHash,
    })
    .from(authorAccounts)
    .leftJoin(
      authorEmails,
      and(
        eq(authorEmails.authorId, authorAccounts.authorId),
        eq(authorEmails.isPrimary, true),
        isNotNull(authorEmails.verifiedAt),
      ),
    )
    .innerJoin(authors, eq(authors.id, authorAccounts.authorId))
    .where(
      and(
        eq(authorAccounts.status, "active"),
        isNull(authors.blockedAt),
        eq(authors.isSystem, false),
        or(
          eq(authorAccounts.normalizedLogin, normalizedIdentity),
          eq(authorEmails.normalizedEmail, normalizedIdentity),
        ),
      ),
    )
    .limit(1);

  return account ?? null;
}

export async function getActiveAuthorAccountByPrimaryEmail(normalizedEmail: string) {
  const [account] = await db.select({ authorId: authorAccounts.authorId, emailId: authorEmails.id, email: authorEmails.email })
    .from(authorAccounts)
    .innerJoin(authorEmails, and(
      eq(authorEmails.authorId, authorAccounts.authorId),
      eq(authorEmails.isPrimary, true),
      isNotNull(authorEmails.verifiedAt),
    ))
    .where(and(eq(authorAccounts.status, "active"), eq(authorEmails.normalizedEmail, normalizedEmail)))
    .limit(1);
  return account ?? null;
}

export async function createAuthorAccount(input: {
  authorId: number;
  login: string;
  normalizedLogin: string;
  passwordHash: string;
  status: AuthorAccountStatus;
}) {
  const [account] = await db.insert(authorAccounts).values(input).returning();
  return account;
}

export async function updateAuthorAccountStatus(input: {
  authorId: number;
  status: AuthorAccountStatus;
  approvedAt?: Date | null;
  approvedByAdminId?: number | null;
  rejectedAt?: Date | null;
  rejectedByAdminId?: number | null;
}) {
  const { authorId, ...values } = input;
  const [account] = await db
    .update(authorAccounts)
    .set({ ...values, updatedAt: new Date() })
    .where(eq(authorAccounts.authorId, authorId))
    .returning();
  return account ?? null;
}

export async function updateAuthorAccountCredentials(input: {
  authorId: number;
  login?: string;
  normalizedLogin?: string;
  passwordHash?: string;
}) {
  const { authorId, ...values } = input;
  const [account] = await db.update(authorAccounts)
    .set({ ...values, updatedAt: new Date() })
    .where(and(eq(authorAccounts.authorId, authorId), eq(authorAccounts.status, "active")))
    .returning();
  return account ?? null;
}

export async function createAuthorEmail(input: {
  authorId: number;
  email: string;
  normalizedEmail: string;
  isPrimary?: boolean;
}) {
  const [email] = await db.insert(authorEmails).values(input).returning();
  return email;
}

export async function createAuthorAuthIdentity(input: {
  authorId: number;
  provider: string;
  providerSubject: string;
  displayValue?: string | null;
  verifiedAt?: Date | null;
}) {
  const [identity] = await db.insert(authorAuthIdentities).values(input).returning();
  return identity;
}

export async function getAuthorByAuthIdentity(provider: string, providerSubject: string) {
  const [identity] = await db
    .select({
      identityId: authorAuthIdentities.id,
      authorId: authors.id,
      authorCode: authors.code,
    })
    .from(authorAuthIdentities)
    .innerJoin(authors, eq(authors.id, authorAuthIdentities.authorId))
    .where(
      and(
        eq(authorAuthIdentities.provider, provider),
        eq(authorAuthIdentities.providerSubject, providerSubject),
        isNull(authors.blockedAt),
      ),
    )
    .limit(1);
  return identity ?? null;
}

export async function createAuthorAuthChallenge(input: {
  authorId: number;
  emailId?: number | null;
  purpose: AuthorAuthChallengePurpose;
  tokenHash: string;
  expiresAt: Date;
}) {
  const [challenge] = await db.insert(authorAuthChallenges).values(input).returning();
  return challenge;
}

export async function consumeAuthorAuthChallenge(tokenHash: string, now = new Date()) {
  const [challenge] = await db
    .update(authorAuthChallenges)
    .set({ consumedAt: now })
    .where(
      and(
        eq(authorAuthChallenges.tokenHash, tokenHash),
        isNull(authorAuthChallenges.consumedAt),
        gt(authorAuthChallenges.expiresAt, now),
      ),
    )
    .returning();
  return challenge ?? null;
}

export async function insertAuthorSession(input: {
  authorId: number;
  tokenHash: string;
  authMethod: AuthorAuthMethod;
  expiresAt: Date;
  ipAddress?: string | null;
  userAgent?: string | null;
}) {
  const [session] = await db.insert(authorSessions).values(input).returning();
  return session;
}

export async function getActiveAuthorSessionByTokenHash(tokenHash: string, now = new Date()) {
  const [session] = await db
    .select({
      sessionId: authorSessions.id,
      lastSeenAt: authorSessions.lastSeenAt,
      authMethod: authorSessions.authMethod,
      createdAt: authorSessions.createdAt,
      authorId: authors.id,
      authorCode: authors.code,
    })
    .from(authorSessions)
    .innerJoin(authors, eq(authors.id, authorSessions.authorId))
    .leftJoin(authorAccounts, eq(authorAccounts.authorId, authors.id))
    .where(
      and(
        eq(authorSessions.tokenHash, tokenHash),
        isNull(authorSessions.revokedAt),
        gt(authorSessions.expiresAt, now),
        isNull(authors.blockedAt),
        eq(authors.isSystem, false),
        or(
          isNull(authorAccounts.authorId),
          eq(authorAccounts.status, "active"),
          and(
            eq(authorSessions.authMethod, "access_token"),
            eq(authorAccounts.status, "pending_email"),
          ),
        ),
      ),
    )
    .limit(1);
  return session ?? null;
}

export async function touchAuthorSession(id: number, now = new Date()) {
  const staleBefore = new Date(now.getTime() - 5 * 60 * 1000);
  await db
    .update(authorSessions)
    .set({ lastSeenAt: now })
    .where(and(eq(authorSessions.id, id), lte(authorSessions.lastSeenAt, staleBefore)));
}

export async function revokeAuthorSessionByTokenHash(tokenHash: string, now = new Date()) {
  await db
    .update(authorSessions)
    .set({ revokedAt: now })
    .where(and(eq(authorSessions.tokenHash, tokenHash), isNull(authorSessions.revokedAt)));
}
