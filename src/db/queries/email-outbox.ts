import { randomUUID } from "node:crypto";
import { and, asc, desc, eq, inArray, isNotNull, isNull, lt, lte, or, sql } from "drizzle-orm";

import { db } from "@/db";
import { adminActivityLogs, emailDeliverySettings, emailOutbox } from "@/db/schema";
import type { CreateActivityLogInput } from "@/db/queries/activity-logs";
import type { EmailOutboxStatus, EmailOutboxTemplate } from "@/lib/auth/author-account-model";
import { EMAIL_AUTOMATION_LEASE_MS, sanitizeEmailDeliveryError } from "@/lib/auth/email-automation";

export async function enqueueEmailOutbox(input: {
  template: EmailOutboxTemplate;
  recipient: string;
  encryptedPayload: string;
  nextAttemptAt?: Date;
}) {
  const [message] = await db.insert(emailOutbox).values(input).returning();
  return message;
}

export async function getPendingEmailOutboxMessages(limit: number, now = new Date()) {
  return db
    .select()
    .from(emailOutbox)
    .where(and(eq(emailOutbox.status, "pending"), lte(emailOutbox.nextAttemptAt, now)))
    .orderBy(asc(emailOutbox.nextAttemptAt), asc(emailOutbox.id))
    .limit(limit);
}

/** Null-token sending rows predate fencing: their delivery outcome is unknown. */
export const EMAIL_LEGACY_UNKNOWN_ERROR = "Исход предыдущей доставки неизвестен. Требуется ручная проверка перед повтором.";

export async function claimPendingEmailOutboxMessages(limit: number, maxAttempts = 5, now = new Date()) {
  const safeLimit = Math.max(1, Math.min(limit, 50));
  const staleLease = sql`clock_timestamp() - (${EMAIL_AUTOMATION_LEASE_MS} * interval '1 millisecond')`;
  const expiredSending = and(eq(emailOutbox.status, "sending"), lte(emailOutbox.updatedAt, staleLease));
  const eligible = or(eq(emailOutbox.status, "pending"), and(expiredSending, isNotNull(emailOutbox.leaseToken)));

  return db.transaction(async (tx) => {
    await tx.update(emailOutbox).set({
      status: "failed", leaseToken: null, lastError: EMAIL_LEGACY_UNKNOWN_ERROR, updatedAt: sql`clock_timestamp()`,
    }).where(and(expiredSending, isNull(emailOutbox.leaseToken)));
    await tx.update(emailOutbox).set({
      status: "failed", leaseToken: null, lastError: "Достигнут лимит попыток доставки.", updatedAt: sql`clock_timestamp()`,
    }).where(and(lte(emailOutbox.nextAttemptAt, now), sql`${emailOutbox.attempts} >= ${maxAttempts}`, eligible));
    const candidates = await tx.select({ id: emailOutbox.id }).from(emailOutbox)
      .where(and(lte(emailOutbox.nextAttemptAt, now), lt(emailOutbox.attempts, maxAttempts), eligible))
      .orderBy(asc(emailOutbox.nextAttemptAt), asc(emailOutbox.id))
      .limit(safeLimit).for("update", { skipLocked: true });
    if (candidates.length === 0) return [];
    // A batch shares one random owner token; ID + token fences each individual row.
    return tx.update(emailOutbox).set({
      status: "sending", leaseToken: randomUUID(), attempts: sql`${emailOutbox.attempts} + 1`, updatedAt: sql`clock_timestamp()`,
    }).where(inArray(emailOutbox.id, candidates.map(({ id }) => id))).returning();
  });
}

function activeEmailLease(id: number, leaseToken: string) {
  return and(eq(emailOutbox.id, id), eq(emailOutbox.status, "sending"), eq(emailOutbox.leaseToken, leaseToken),
    sql`${emailOutbox.updatedAt} > clock_timestamp() - (${EMAIL_AUTOMATION_LEASE_MS} * interval '1 millisecond')`);
}

export async function validateEmailOutboxLease(id: number, leaseToken: string) {
  const [row] = await db.select({ id: emailOutbox.id }).from(emailOutbox).where(activeEmailLease(id, leaseToken)).limit(1);
  return Boolean(row);
}

export async function updateEmailOutboxStatus(input: {
  id: number;
  leaseToken: string;
  status: Exclude<EmailOutboxStatus, "sending">;
  nextAttemptAt?: Date;
  sentAt?: Date | null;
  lastError?: string | null;
}) {
  const { id, leaseToken, ...values } = input;
  const rows = await db.update(emailOutbox).set({ ...values, leaseToken: null, updatedAt: sql`clock_timestamp()` })
    .where(activeEmailLease(id, leaseToken)).returning({ id: emailOutbox.id });
  return rows.length > 0;
}

/** Safe counts and row metadata; no recipients, bodies, credentials or idempotency keys. */
export async function getEmailLeaseCutoverReport() {
  const [schema] = await db.execute<{ present: boolean }>(sql`select exists(
    select 1 from pg_attribute where attrelid = to_regclass(format('%I.%I', current_schema(), 'email_outbox')) and attname = 'lease_token' and not attisdropped
  ) as present`);
  // The report also runs before the additive migration; all old sending rows lack fencing.
  const legacyLease = schema.present ? isNull(emailOutbox.leaseToken) : sql`true`;
  const [report] = await db.select({
    legacySending: sql<number>`count(*) filter (where ${emailOutbox.status} = 'sending' and ${legacyLease})::int`,
    legacyExpired: sql<number>`count(*) filter (where ${emailOutbox.status} = 'sending' and ${legacyLease} and ${emailOutbox.updatedAt} <= clock_timestamp() - (${EMAIL_AUTOMATION_LEASE_MS} * interval '1 millisecond'))::int`,
    unknownFailed: sql<number>`count(*) filter (where ${emailOutbox.status} = 'failed' and ${emailOutbox.lastError} = ${EMAIL_LEGACY_UNKNOWN_ERROR})::int`,
  }).from(emailOutbox).where(inArray(emailOutbox.status, ["sending", "failed"]));
  const rows = await db.select({ id: emailOutbox.id, template: emailOutbox.template, status: emailOutbox.status,
    attempts: emailOutbox.attempts, createdAt: emailOutbox.createdAt, updatedAt: emailOutbox.updatedAt,
  }).from(emailOutbox).where(or(
    and(eq(emailOutbox.status, "sending"), legacyLease),
    and(eq(emailOutbox.status, "failed"), eq(emailOutbox.lastError, EMAIL_LEGACY_UNKNOWN_ERROR)),
  )).orderBy(asc(emailOutbox.status), asc(emailOutbox.createdAt), asc(emailOutbox.id)).limit(100);
  const [provider] = await db.select({ enabled: emailDeliverySettings.enabled,
    configured: sql<boolean>`nullif(btrim(${emailDeliverySettings.encryptedApiKey}), '') is not null`,
  }).from(emailDeliverySettings).limit(1);
  return { ...report, schemaReady: schema.present, provider: { code: "resend", enabled: provider?.enabled ?? false, configured: provider?.configured ?? false },
    rows, rowsTruncated: report.legacySending + report.unknownFailed > rows.length,
    ready: schema.present && report.legacySending === 0 && report.unknownFailed === 0 };
}

function maskEmailRecipient(recipient: string) {
  const [local = "", domain = ""] = recipient.split("@");
  const visible = local.slice(0, Math.min(2, local.length));
  return domain ? `${visible}${"*".repeat(Math.max(2, local.length - visible.length))}@${domain}` : "***";
}

export async function getAdminEmailOutbox(input: {
  page: number;
  pageSize: number;
  status?: EmailOutboxStatus | null;
  template?: EmailOutboxTemplate | null;
}) {
  const conditions = [
    ...(input.status ? [eq(emailOutbox.status, input.status)] : []),
    ...(input.template ? [eq(emailOutbox.template, input.template)] : []),
  ];
  const where = conditions.length ? and(...conditions) : undefined;
  const [{ count }] = await db.select({ count: sql<number>`count(*)::int` }).from(emailOutbox).where(where);
  const pageSize = [25, 50, 100].includes(input.pageSize) ? input.pageSize : 25;
  const totalPages = Math.max(1, Math.ceil(count / pageSize));
  const page = Math.max(1, Math.min(input.page, totalPages));
  const rows = await db.select({
    id: emailOutbox.id,
    template: emailOutbox.template,
    recipient: emailOutbox.recipient,
    status: emailOutbox.status,
    attempts: emailOutbox.attempts,
    createdAt: emailOutbox.createdAt,
    nextAttemptAt: emailOutbox.nextAttemptAt,
    sentAt: emailOutbox.sentAt,
    lastError: emailOutbox.lastError,
  }).from(emailOutbox).where(where)
    .orderBy(desc(emailOutbox.createdAt), desc(emailOutbox.id))
    .limit(pageSize).offset((page - 1) * pageSize);
  return {
    items: rows.map((row) => ({
      ...row,
      recipient: maskEmailRecipient(row.recipient),
      lastError: row.lastError ? sanitizeEmailDeliveryError(row.lastError) : null,
    })),
    page, pageSize, totalPages, totalCount: count,
  };
}

export async function getEmailOutboxStatusCounts() {
  return db.select({ status: emailOutbox.status, count: sql<number>`count(*)::int` })
    .from(emailOutbox).groupBy(emailOutbox.status);
}

export async function retryFailedEmailOutbox(input: {
  id: number;
  activityLog: CreateActivityLogInput;
}, now = new Date()) {
  return db.transaction(async (tx) => {
    const ids = await tx.select({ id: emailOutbox.id }).from(emailOutbox)
      .where(and(eq(emailOutbox.id, input.id), eq(emailOutbox.status, "failed")))
      .for("update").limit(1);
    const rows = ids.length ? await tx.update(emailOutbox).set({
        status: "pending", attempts: 0, nextAttemptAt: now, sentAt: null, lastError: null, leaseToken: null, updatedAt: now,
      }).where(and(inArray(emailOutbox.id, ids.map(({ id }) => id)), eq(emailOutbox.status, "failed")))
        .returning({ id: emailOutbox.id }) : [];
    await tx.insert(adminActivityLogs).values({
      ...input.activityLog,
      metadata: { count: rows.length, id: input.id },
    });
    return rows.length;
  });
}
