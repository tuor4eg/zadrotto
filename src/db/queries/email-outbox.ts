import { and, asc, eq, inArray, lte, or } from "drizzle-orm";

import { db } from "@/db";
import { emailOutbox } from "@/db/schema";
import type { EmailOutboxStatus, EmailOutboxTemplate } from "@/lib/auth/author-account-model";

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

export async function claimPendingEmailOutboxMessages(limit: number, now = new Date()) {
  const safeLimit = Math.max(1, Math.min(limit, 50));
  const staleLease = new Date(now.getTime() - 10 * 60 * 1000);

  return db.transaction(async (tx) => {
    const candidates = await tx
      .select({ id: emailOutbox.id })
      .from(emailOutbox)
      .where(and(
        lte(emailOutbox.nextAttemptAt, now),
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
    .where(eq(emailOutbox.id, id));
}
