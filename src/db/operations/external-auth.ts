import { randomUUID } from "node:crypto";
import { normalizeAuthorDisplayName } from "@/lib/authors/display-name";
import { and, eq, gt, inArray, isNull, ne } from "drizzle-orm";
import { db } from "@/db";
import { authors, authorAccounts, authorAuthIdentities, authorSessions, authorAccessTokens, authProviderSettings } from "@/db/schema";
import { runInDomainEventTransaction } from "@/db/transaction";
import { resolveAuthorRegistrationAccessProfile } from "@/db/queries/author-registration-settings";
import { generateEntityCode } from "@/lib/common/generated-code";
import { AUTHOR_SESSION_MAX_AGE_SECONDS, generateAuthorSessionToken, hashAuthorSessionToken } from "@/lib/auth/author-session";

export class ExternalAuthError extends Error {
  constructor(public readonly code: "unavailable" | "conflict" | "session-changed" | "last-method") {
    super(code);
    this.name = "ExternalAuthError";
  }
}
type Tx = Parameters<Parameters<typeof db.transaction>[0]>[0];
async function lockAuthor(tx: Tx, authorId: number) {
  const [author] = await tx.select().from(authors).where(eq(authors.id, authorId)).for("update");
  if (!author || author.blockedAt || author.isSystem || author.mergedIntoAuthorId) throw new ExternalAuthError("unavailable");
  const [account] = await tx.select().from(authorAccounts).where(eq(authorAccounts.authorId, authorId));
  if (account && account.status !== "active" && account.status !== "pending_email") throw new ExternalAuthError("unavailable");
  return author;
}
async function validateSession(tx: Tx, authorId: number, sessionId?: number) {
  if (!sessionId) throw new ExternalAuthError("session-changed");
  const [session] = await tx.select().from(authorSessions).where(and(eq(authorSessions.id, sessionId), eq(authorSessions.authorId, authorId), isNull(authorSessions.revokedAt), gt(authorSessions.expiresAt, new Date()))).for("update");
  if (!session) throw new ExternalAuthError("session-changed");
  return session;
}
function isUniqueViolation(error: unknown): boolean {
  if (!error || typeof error !== "object") return false;
  const value = error as { code?: string; cause?: unknown };
  return value.code === "23505" || Boolean(value.cause && isUniqueViolation(value.cause));
}
export async function completeExternalAuth(input: {
  provider: string; subject: string; name?: string | null; displayValue?: string | null;
  configurationRevision?: string;
  intent: "login" | "link"; authorId?: number; sessionId?: number; ipAddress?: string | null; userAgent?: string | null;
}): Promise<{ authorId: number; identityId: number; token?: string; expiresAt?: Date; avatarVersion: number; avatarSourceIdentityId: number | null }> {
  if (!input.provider || !input.subject) throw new ExternalAuthError("unavailable");
  const validName = normalizeAuthorDisplayName(input.name ?? "");
  for (let attempt = 0; ; attempt++) {
    try {
      return await runInDomainEventTransaction(async (tx, appendEvent) => {
        // Share-lock configuration through identity/session commit. Admin saves take the
        // matching update lock before changing credentials or checking existing identities.
        if (input.configurationRevision !== undefined) {
          const [configuration] = await tx.select({ enabled: authProviderSettings.enabled, revision: authProviderSettings.revision })
            .from(authProviderSettings).where(eq(authProviderSettings.providerCode, input.provider)).for("share");
          if (!configuration?.enabled || configuration.revision !== input.configurationRevision) throw new ExternalAuthError("unavailable");
        }
        const now = new Date();
        // Lock the author before identities so all credential mutations share one order.
        let author = input.intent === "link" && input.authorId ? await lockAuthor(tx, input.authorId) : undefined;
        if (input.intent === "link") {
          if (!author) throw new ExternalAuthError("session-changed");
          await validateSession(tx, author.id, input.sessionId);
        }
        let [identity] = await tx.select().from(authorAuthIdentities).where(and(eq(authorAuthIdentities.provider, input.provider), eq(authorAuthIdentities.providerSubject, input.subject)));
        if (input.intent === "link") {
          if (identity && identity.authorId !== author!.id) throw new ExternalAuthError("conflict");
          if (!identity) {
            const [other] = await tx.select({ id: authorAuthIdentities.id }).from(authorAuthIdentities).where(and(eq(authorAuthIdentities.authorId, author!.id), eq(authorAuthIdentities.provider, input.provider)));
            if (other) throw new ExternalAuthError("conflict");
            [identity] = await tx.insert(authorAuthIdentities).values({ authorId: author!.id, provider: input.provider, providerSubject: input.subject, displayValue: input.displayValue, verifiedAt: now, lastUsedAt: now }).returning();
          }
        } else if (identity) {
          author = await lockAuthor(tx, identity.authorId);
          // A concurrent unlink can remove the identity while we wait for the author.
          [identity] = await tx.select().from(authorAuthIdentities).where(eq(authorAuthIdentities.id, identity.id));
          if (!identity) throw new ExternalAuthError("session-changed");
          if (author.nameSourceIdentityId === identity.id && validName) {
            await tx.update(authors).set({ name: validName, updatedAt: now }).where(eq(authors.id, author.id));
          }
        } else {
          const { profile } = await resolveAuthorRegistrationAccessProfile(tx);
          [author] = await tx.insert(authors).values({ name: validName ?? "Пользователь", code: generateEntityCode({ name: validName ?? "Пользователь", type: "author", uniqueId: randomUUID().slice(0, 8) }), accessProfileId: profile.id }).returning();
          [identity] = await tx.insert(authorAuthIdentities).values({ authorId: author.id, provider: input.provider, providerSubject: input.subject, displayValue: input.displayValue, verifiedAt: now, lastUsedAt: now }).returning();
          [author] = await tx.update(authors).set({ nameSourceIdentityId: identity.id, avatarSourceIdentityId: identity.id }).where(eq(authors.id, author.id)).returning();
          await appendEvent({ type: "author.registration.submitted", aggregateType: "author", aggregateId: String(author.id), actorAuthorId: author.id, payload: { authorId: author.id } });
        }
        await tx.update(authorAuthIdentities).set({ lastUsedAt: now, displayValue: input.displayValue, updatedAt: now }).where(eq(authorAuthIdentities.id, identity.id));
        const result = { authorId: author!.id, identityId: identity.id, avatarVersion: author!.avatarVersion, avatarSourceIdentityId: author!.avatarSourceIdentityId };
        if (input.intent === "link") return result;
        const token = generateAuthorSessionToken();
        const expiresAt = new Date(now.getTime() + AUTHOR_SESSION_MAX_AGE_SECONDS * 1000);
        await tx.insert(authorSessions).values({ authorId: author!.id, identityId: identity.id, provider: input.provider, authMethod: "external", tokenHash: hashAuthorSessionToken(token), expiresAt, ipAddress: input.ipAddress, userAgent: input.userAgent });
        return { ...result, token, expiresAt };
      });
    } catch (error) {
      if (!isUniqueViolation(error)) throw error;
      if (attempt < 2) continue;
      throw new ExternalAuthError("conflict");
    }
  }
}
export async function getExternalAuthIdentities(authorId: number) {
  return db.select().from(authorAuthIdentities).where(eq(authorAuthIdentities.authorId, authorId));
}
export async function unlinkExternalAuthIdentity(input: { authorId: number; sessionId: number; identityId: number; availableProviders: readonly string[] }) {
  return db.transaction(async (tx) => {
    await lockAuthor(tx, input.authorId);
    const session = await validateSession(tx, input.authorId, input.sessionId);
    const [identity] = await tx.select().from(authorAuthIdentities).where(and(eq(authorAuthIdentities.id, input.identityId), eq(authorAuthIdentities.authorId, input.authorId)));
    if (!identity) throw new ExternalAuthError("conflict");
    const [password] = await tx.select({ id: authorAccounts.authorId }).from(authorAccounts).where(and(eq(authorAccounts.authorId, input.authorId), eq(authorAccounts.status, "active")));
    const [token] = await tx.select({ id: authorAccessTokens.id }).from(authorAccessTokens).where(and(eq(authorAccessTokens.authorId, input.authorId), isNull(authorAccessTokens.revokedAt))).limit(1);
    const [other] = input.availableProviders.length ? await tx.select({ id: authorAuthIdentities.id }).from(authorAuthIdentities).where(and(eq(authorAuthIdentities.authorId, input.authorId), ne(authorAuthIdentities.id, identity.id), inArray(authorAuthIdentities.provider, [...input.availableProviders]))).limit(1) : [];
    if (!password && !token && !other) throw new ExternalAuthError("last-method");
    await tx.update(authorSessions).set({ revokedAt: new Date() }).where(and(eq(authorSessions.authorId, input.authorId), eq(authorSessions.identityId, identity.id), isNull(authorSessions.revokedAt)));
    await tx.delete(authorAuthIdentities).where(eq(authorAuthIdentities.id, identity.id));
    return { currentSessionRevoked: session.identityId === identity.id };
  });
}
export async function commitExternalAvatar(input: { authorId: number; identityId: number; expectedVersion: number; objectKey: string }) {
  return db.transaction(async (tx) => {
    const [author] = await tx.select().from(authors).where(eq(authors.id, input.authorId)).for("update");
    if (!author || author.avatarSourceIdentityId !== input.identityId || author.avatarVersion !== input.expectedVersion) return { applied: false };
    await tx.update(authors).set({ avatarObjectKey: input.objectKey, avatarVersion: author.avatarVersion + 1, updatedAt: new Date() }).where(eq(authors.id, input.authorId));
    return { applied: true, previousObjectKey: author.avatarObjectKey };
  });
}
