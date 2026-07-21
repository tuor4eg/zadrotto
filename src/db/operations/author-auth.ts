import { randomUUID } from "node:crypto";

import { and, eq, gt, isNotNull, isNull, lt, or, sql } from "drizzle-orm";

import { db } from "@/db";
import {
  authorAccounts,
  authorAuthChallenges,
  authorEmails,
  authorSessions,
  authors,
  emailOutbox,
} from "@/db/schema";
import { createAuthorAuthChallenge, insertAuthorSession } from "@/db/queries/author-auth";
import { enqueueEmailOutbox } from "@/db/queries/email-outbox";
import { resolveAuthorRegistrationAccessProfile } from "@/db/queries/author-registration-settings";
import type {
  AuthorAuthChallengePurpose,
  AuthorAuthMethod,
  EmailOutboxTemplate,
} from "@/lib/auth/author-account-model";
import {
  AUTHOR_SESSION_MAX_AGE_SECONDS,
  generateAuthorSessionToken,
  hashAuthorSessionToken,
} from "@/lib/auth/author-session";
import {
  generateAuthorAuthChallengeToken,
  hashAuthorAuthChallengeToken,
} from "@/lib/auth/challenges";
import { encryptEmailOutboxPayload } from "@/lib/auth/email-outbox-crypto";
import { generateEntityCode } from "@/lib/common/generated-code";
import { isAuthorEmailDeliveryConfigured } from "@/lib/auth/features";
import { EMAIL_AUTOMATION_DEFAULTS, type EmailAutomationSettingsInput } from "@/lib/auth/email-automation";

export async function createAuthorSession(input: {
  authorId: number;
  authMethod: AuthorAuthMethod;
  ipAddress?: string | null;
  userAgent?: string | null;
}) {
  const token = generateAuthorSessionToken();
  const expiresAt = new Date(Date.now() + AUTHOR_SESSION_MAX_AGE_SECONDS * 1000);
  const session = await insertAuthorSession({
    ...input,
    expiresAt,
    tokenHash: hashAuthorSessionToken(token),
  });

  return { token, expiresAt, session };
}

export async function issueAuthorAuthChallenge(input: {
  authorId: number;
  emailId?: number | null;
  purpose: AuthorAuthChallengePurpose;
  expiresAt: Date;
}) {
  const token = generateAuthorAuthChallengeToken();
  const challenge = await createAuthorAuthChallenge({
    ...input,
    tokenHash: hashAuthorAuthChallengeToken(token),
  });

  return { token, challenge };
}

export async function enqueueEncryptedEmail(input: {
  template: EmailOutboxTemplate;
  recipient: string;
  payload: Record<string, unknown>;
  nextAttemptAt?: Date;
}) {
  return enqueueEmailOutbox({
    template: input.template,
    recipient: input.recipient,
    encryptedPayload: encryptEmailOutboxPayload(input.payload),
    nextAttemptAt: input.nextAttemptAt,
  });
}

const AUTHOR_EMAIL_CHALLENGE_MAX_AGE_MS = 24 * 60 * 60 * 1000;

async function insertVerificationChallenge(
  tx: Parameters<Parameters<typeof db.transaction>[0]>[0],
  input: { authorId: number; emailId: number; recipient: string },
) {
  const token = generateAuthorAuthChallengeToken();
  const expiresAt = new Date(Date.now() + AUTHOR_EMAIL_CHALLENGE_MAX_AGE_MS);
  await tx.insert(authorAuthChallenges).values({
    authorId: input.authorId,
    emailId: input.emailId,
    purpose: "verify_email",
    tokenHash: hashAuthorAuthChallengeToken(token),
    expiresAt,
  });
  await tx.insert(emailOutbox).values({
    template: "verify_email",
    recipient: input.recipient,
    encryptedPayload: encryptEmailOutboxPayload({ token }),
  });
}

export async function onboardExistingAuthor(input: {
  authorId: number;
  login: string;
  normalizedLogin: string;
  passwordHash: string;
  email: string;
  normalizedEmail: string;
}) {
  if (!(await isAuthorEmailDeliveryConfigured())) throw new Error("Author email delivery is unavailable");
  return db.transaction(async (tx) => {
    const [account] = await tx
      .insert(authorAccounts)
      .values({
        authorId: input.authorId,
        login: input.login,
        normalizedLogin: input.normalizedLogin,
        passwordHash: input.passwordHash,
        status: "pending_email",
      })
      .returning({ authorId: authorAccounts.authorId });
    const [email] = await tx
      .insert(authorEmails)
      .values({
        authorId: input.authorId,
        email: input.email,
        normalizedEmail: input.normalizedEmail,
        isPrimary: true,
      })
      .returning({ id: authorEmails.id });
    await insertVerificationChallenge(tx, {
      authorId: account.authorId,
      emailId: email.id,
      recipient: input.email,
    });
    return account;
  });
}

export async function registerAuthorAccount(input: {
  name: string;
  login: string;
  normalizedLogin: string;
  passwordHash: string;
  email: string;
  normalizedEmail: string;
}) {
  if (!(await isAuthorEmailDeliveryConfigured())) throw new Error("Author email delivery is unavailable");
  return db.transaction(async (tx) => {
    const { profile: registrationProfile } = await resolveAuthorRegistrationAccessProfile(tx);
    const [author] = await tx
      .insert(authors)
      .values({
        code: generateEntityCode({ name: input.name, type: "author", uniqueId: randomUUID().slice(0, 8) }),
        name: input.name,
        accessProfileId: registrationProfile.id,
      })
      .returning({ id: authors.id });
    await tx.insert(authorAccounts).values({
      authorId: author.id,
      login: input.login,
      normalizedLogin: input.normalizedLogin,
      passwordHash: input.passwordHash,
      status: "pending_email",
    });
    const [email] = await tx
      .insert(authorEmails)
      .values({
        authorId: author.id,
        email: input.email,
        normalizedEmail: input.normalizedEmail,
        isPrimary: true,
      })
      .returning({ id: authorEmails.id });
    await insertVerificationChallenge(tx, {
      authorId: author.id,
      emailId: email.id,
      recipient: input.email,
    });
    return author;
  });
}

export async function verifyAuthorEmailChallenge(tokenHash: string, now = new Date()) {
  return db.transaction(async (tx) => {
    const [challenge] = await tx
      .update(authorAuthChallenges)
      .set({ consumedAt: now })
      .where(and(
        eq(authorAuthChallenges.tokenHash, tokenHash),
        sql`${authorAuthChallenges.purpose} in ('verify_email', 'change_email')`,
        isNull(authorAuthChallenges.consumedAt),
        gt(authorAuthChallenges.expiresAt, now),
      ))
      .returning({ authorId: authorAuthChallenges.authorId, emailId: authorAuthChallenges.emailId, purpose: authorAuthChallenges.purpose });
    if (!challenge?.emailId) return null;
    if (challenge.purpose === "change_email") {
      const [oldPrimary] = await tx.select({ email: authorEmails.email }).from(authorEmails).where(and(
        eq(authorEmails.authorId, challenge.authorId),
        eq(authorEmails.isPrimary, true),
      )).limit(1);
      await tx.update(authorEmails).set({ isPrimary: false, updatedAt: now }).where(and(
        eq(authorEmails.authorId, challenge.authorId),
        eq(authorEmails.isPrimary, true),
      ));
      await tx.update(authorEmails).set({ isPrimary: true, verifiedAt: now, updatedAt: now }).where(eq(authorEmails.id, challenge.emailId));
      await tx.update(authorSessions).set({ revokedAt: now }).where(and(
        eq(authorSessions.authorId, challenge.authorId),
        isNull(authorSessions.revokedAt),
      ));
      await tx.update(authorAuthChallenges).set({ consumedAt: now }).where(and(
        eq(authorAuthChallenges.authorId, challenge.authorId),
        eq(authorAuthChallenges.purpose, "change_email"),
        isNull(authorAuthChallenges.consumedAt),
      ));
      await tx.delete(authorEmails).where(and(
        eq(authorEmails.authorId, challenge.authorId),
        eq(authorEmails.isPrimary, false),
        isNull(authorEmails.verifiedAt),
        sql`${authorEmails.id} <> ${challenge.emailId}`,
      ));
      if (oldPrimary) {
        await tx.insert(emailOutbox).values({
          template: "email_changed",
          recipient: oldPrimary.email,
          encryptedPayload: encryptEmailOutboxPayload({}),
        });
      }
      return { authorId: challenge.authorId, status: "active" as const, purpose: "change_email" as const };
    }
    await tx.update(authorEmails).set({ verifiedAt: now, updatedAt: now }).where(eq(authorEmails.id, challenge.emailId));
    const [activatedAccount] = await tx
      .update(authorAccounts)
      .set({ status: "active", updatedAt: now })
      .where(and(
        eq(authorAccounts.authorId, challenge.authorId),
        eq(authorAccounts.status, "pending_email"),
      ))
      .returning({ authorId: authorAccounts.authorId });
    if (!activatedAccount) return null;
    return { authorId: challenge.authorId, status: "active" as const, purpose: "verify_email" as const };
  });
}

export async function requestAuthorEmailChange(input: {
  authorId: number;
  email: string;
  normalizedEmail: string;
}) {
  return db.transaction(async (tx) => {
    const now = new Date();
    await tx.update(authorAuthChallenges).set({ consumedAt: now }).where(and(
      eq(authorAuthChallenges.authorId, input.authorId),
      eq(authorAuthChallenges.purpose, "change_email"),
      isNull(authorAuthChallenges.consumedAt),
    ));
    await tx.delete(authorEmails).where(and(
      eq(authorEmails.authorId, input.authorId),
      eq(authorEmails.isPrimary, false),
      isNull(authorEmails.verifiedAt),
    ));
    const [email] = await tx.insert(authorEmails).values({
      authorId: input.authorId,
      email: input.email,
      normalizedEmail: input.normalizedEmail,
      isPrimary: false,
    }).returning({ id: authorEmails.id });
    const token = generateAuthorAuthChallengeToken();
    await tx.insert(authorAuthChallenges).values({
      authorId: input.authorId,
      emailId: email.id,
      purpose: "change_email",
      tokenHash: hashAuthorAuthChallengeToken(token),
      expiresAt: new Date(Date.now() + AUTHOR_EMAIL_CHALLENGE_MAX_AGE_MS),
    });
    await tx.insert(emailOutbox).values({
      template: "verify_email",
      recipient: input.email,
      encryptedPayload: encryptEmailOutboxPayload({ token }),
    });
    return email;
  });
}

export async function resendAuthorEmailVerification(authorId: number) {
  return db.transaction(async (tx) => {
    const [email] = await tx.select({ id: authorEmails.id, email: authorEmails.email })
      .from(authorEmails)
      .innerJoin(authorAccounts, eq(authorAccounts.authorId, authorEmails.authorId))
      .where(and(
        eq(authorEmails.authorId, authorId),
        eq(authorEmails.isPrimary, true),
        isNull(authorEmails.verifiedAt),
        eq(authorAccounts.status, "pending_email"),
      )).limit(1);
    if (!email) return false;
    const now = new Date();
    await tx.update(authorAuthChallenges).set({ consumedAt: now }).where(and(
      eq(authorAuthChallenges.authorId, authorId),
      eq(authorAuthChallenges.purpose, "verify_email"),
      isNull(authorAuthChallenges.consumedAt),
    ));
    const token = generateAuthorAuthChallengeToken();
    await tx.insert(authorAuthChallenges).values({
      authorId,
      emailId: email.id,
      purpose: "verify_email",
      tokenHash: hashAuthorAuthChallengeToken(token),
      expiresAt: new Date(Date.now() + AUTHOR_EMAIL_CHALLENGE_MAX_AGE_MS),
    });
    await tx.insert(emailOutbox).values({
      template: "verify_email",
      recipient: email.email,
      encryptedPayload: encryptEmailOutboxPayload({ token }),
    });
    return true;
  });
}

export async function resetAuthorPassword(input: { tokenHash: string; passwordHash: string }) {
  return db.transaction(async (tx) => {
    const now = new Date();
    const [challenge] = await tx.update(authorAuthChallenges).set({ consumedAt: now }).where(and(
      eq(authorAuthChallenges.tokenHash, input.tokenHash),
      eq(authorAuthChallenges.purpose, "reset_password"),
      isNull(authorAuthChallenges.consumedAt),
      gt(authorAuthChallenges.expiresAt, now),
    )).returning({ authorId: authorAuthChallenges.authorId });
    if (!challenge) return false;
    const [updatedAccount] = await tx.update(authorAccounts).set({ passwordHash: input.passwordHash, updatedAt: now }).where(and(
      eq(authorAccounts.authorId, challenge.authorId),
      eq(authorAccounts.status, "active"),
    )).returning({ authorId: authorAccounts.authorId });
    if (!updatedAccount) return false;
    await tx.update(authorAuthChallenges).set({ consumedAt: now }).where(and(
      eq(authorAuthChallenges.authorId, challenge.authorId),
      eq(authorAuthChallenges.purpose, "reset_password"),
      isNull(authorAuthChallenges.consumedAt),
    ));
    await tx.update(authorSessions).set({ revokedAt: now }).where(and(
      eq(authorSessions.authorId, challenge.authorId),
      isNull(authorSessions.revokedAt),
    ));
    return true;
  });
}

export async function cleanupAuthorAuthData(
  settings: Pick<EmailAutomationSettingsInput, "challengeRetentionHours" | "sessionRetentionDays" | "staleRegistrationDays" | "sentOutboxRetentionDays" | "failedOutboxRetentionDays"> = EMAIL_AUTOMATION_DEFAULTS,
  now = new Date(),
) {
  const challengeCutoff = new Date(now.getTime() - settings.challengeRetentionHours * 60 * 60 * 1000);
  const sessionCutoff = new Date(now.getTime() - settings.sessionRetentionDays * 24 * 60 * 60 * 1000);
  const registrationCutoff = new Date(now.getTime() - settings.staleRegistrationDays * 24 * 60 * 60 * 1000);
  const sentOutboxCutoff = new Date(now.getTime() - settings.sentOutboxRetentionDays * 24 * 60 * 60 * 1000);
  const failedOutboxCutoff = new Date(now.getTime() - settings.failedOutboxRetentionDays * 24 * 60 * 60 * 1000);

  return db.transaction(async (tx) => {
    const expiredChallenges = await tx.delete(authorAuthChallenges).where(or(
      lt(authorAuthChallenges.expiresAt, challengeCutoff),
      and(
        isNotNull(authorAuthChallenges.consumedAt),
        lt(authorAuthChallenges.consumedAt, challengeCutoff),
      ),
    ));
    const expiredSessions = await tx.delete(authorSessions).where(or(
      lt(authorSessions.expiresAt, sessionCutoff),
      and(
        isNotNull(authorSessions.revokedAt),
        lt(authorSessions.revokedAt, sessionCutoff),
      ),
    ));
    const staleRegistrations = await tx.execute(sql`
      delete from authors a
      using author_accounts aa
      where aa.author_id = a.id
        and aa.status = 'pending_email'
        and aa.created_at < ${registrationCutoff.toISOString()}
        and not exists (select 1 from author_access_tokens t where t.author_id = a.id)
        and not exists (select 1 from ratings r where r.author_id = a.id)
        and not exists (select 1 from author_media_experiences e where e.author_id = a.id)
        and not exists (select 1 from contributions c where c.author_id = a.id)
        and not exists (select 1 from media_items m where m.created_by_author_id = a.id)
        and not exists (select 1 from franchises f where f.created_by_author_id = a.id)
        and not exists (select 1 from media_item_franchises mif where mif.created_by_author_id = a.id)
    `);
    const sentOutbox = await tx.delete(emailOutbox).where(and(
      eq(emailOutbox.status, "sent"),
      lt(emailOutbox.sentAt, sentOutboxCutoff),
    ));
    const failedOutbox = await tx.delete(emailOutbox).where(and(
      eq(emailOutbox.status, "failed"),
      lt(emailOutbox.updatedAt, failedOutboxCutoff),
    ));
    return {
      expiredChallenges: expiredChallenges.count,
      expiredSessions: expiredSessions.count,
      staleRegistrations: staleRegistrations.count,
      sentOutbox: sentOutbox.count,
      failedOutbox: failedOutbox.count,
    };
  });
}
