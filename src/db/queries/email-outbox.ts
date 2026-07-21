import { and, asc, desc, eq, inArray, lt, lte, or, sql } from "drizzle-orm";

import { db } from "@/db";
import { adminActivityLogs, emailOutbox } from "@/db/schema";
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

export async function claimPendingEmailOutboxMessages(limit: number, maxAttempts = 5, now = new Date()) {
  const safeLimit = Math.max(1, Math.min(limit, 50));
  const staleLease = new Date(now.getTime() - EMAIL_AUTOMATION_LEASE_MS);

  return db.transaction(async (tx) => {
    await tx.update(emailOutbox).set({
      status: "failed",
      lastError: "Достигнут лимит попыток доставки.",
      updatedAt: now,
    }).where(and(
      lte(emailOutbox.nextAttemptAt, now),
      sql`${emailOutbox.attempts} >= ${maxAttempts}`,
      or(
        eq(emailOutbox.status, "pending"),
        and(eq(emailOutbox.status, "sending"), lte(emailOutbox.updatedAt, staleLease)),
      ),
    ));
    const candidates = await tx
      .select({ id: emailOutbox.id })
      .from(emailOutbox)
      .where(and(
        lte(emailOutbox.nextAttemptAt, now),
        lt(emailOutbox.attempts, maxAttempts),
        or(
          eq(emailOutbox.status, "pending"),
          and(eq(emailOutbox.status, "sending"), lte(emailOutbox.updatedAt, staleLease)),
        ),
      ))
      .orderBy(asc(emailOutbox.nextAttemptAt), asc(emailOutbox.id))
      .limit(safeLimit)
      .for("update", { skipLocked: true });

    if (candidates.length === 0) return [];
    return tx
      .update(emailOutbox)
      .set({ status: "sending", updatedAt: now })
      .where(inArray(emailOutbox.id, candidates.map(({ id }) => id)))
      .returning();
  });
}

export async function updateEmailOutboxStatus(input: {
  id: number;
  status: EmailOutboxStatus;
  attempts?: number;
  nextAttemptAt?: Date;
  sentAt?: Date | null;
  lastError?: string | null;
}) {
  const { id, ...values } = input;
  await db
    .update(emailOutbox)
    .set({ ...values, updatedAt: new Date() })
    .where(and(eq(emailOutbox.id, id), eq(emailOutbox.status, "sending")));
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
        status: "pending", attempts: 0, nextAttemptAt: now, sentAt: null, lastError: null, updatedAt: now,
      }).where(and(inArray(emailOutbox.id, ids.map(({ id }) => id)), eq(emailOutbox.status, "failed")))
        .returning({ id: emailOutbox.id }) : [];
    await tx.insert(adminActivityLogs).values({
      ...input.activityLog,
      metadata: { count: rows.length, id: input.id },
    });
    return rows.length;
  });
}
