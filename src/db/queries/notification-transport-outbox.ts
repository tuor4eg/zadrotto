import { randomUUID } from "node:crypto"

import { and, asc, eq, lt, lte, or, sql } from "drizzle-orm"

import { db } from "@/db"
import { notificationTransportOutbox } from "@/db/schema"

export const NOTIFICATION_TRANSPORT_LEASE_MS = 30_000

export async function enqueueNotificationTransportRecipients(input: {
  eventId: string
  recipients: string[]
  transport: "telegram"
}) {
  if (input.recipients.length === 0) return
  await db.insert(notificationTransportOutbox).values(input.recipients.map((recipient) => ({
    eventId: input.eventId,
    recipient,
    transport: input.transport,
  }))).onConflictDoNothing()
}

export async function claimPendingNotificationTransportMessages(limit: number, maxAttempts: number, now = new Date()) {
  const safeLimit = Math.max(1, Math.min(limit, 50))
  return db.transaction(async (tx) => {
    await tx.update(notificationTransportOutbox).set({
      status: "failed", leaseToken: null, leaseExpiresAt: null,
      lastError: "Достигнут лимит попыток доставки.", updatedAt: now,
    }).where(and(
      sql`${notificationTransportOutbox.attempts} >= ${maxAttempts}`,
      or(
        eq(notificationTransportOutbox.status, "pending"),
        and(eq(notificationTransportOutbox.status, "sending"), lte(notificationTransportOutbox.leaseExpiresAt, now)),
      ),
    ))

    const candidates = await tx.select({
      eventId: notificationTransportOutbox.eventId,
      recipient: notificationTransportOutbox.recipient,
      transport: notificationTransportOutbox.transport,
    }).from(notificationTransportOutbox).where(and(
      lt(notificationTransportOutbox.attempts, maxAttempts),
      or(
        and(eq(notificationTransportOutbox.status, "pending"), lte(notificationTransportOutbox.nextAttemptAt, now)),
        and(eq(notificationTransportOutbox.status, "sending"), lte(notificationTransportOutbox.leaseExpiresAt, now)),
      ),
    )).orderBy(asc(notificationTransportOutbox.nextAttemptAt), asc(notificationTransportOutbox.eventId))
      .limit(safeLimit).for("update", { skipLocked: true })

    const claimed = []
    for (const candidate of candidates) {
      const leaseToken = randomUUID()
      const [row] = await tx.update(notificationTransportOutbox).set({
        attempts: sql`${notificationTransportOutbox.attempts} + 1`,
        leaseExpiresAt: new Date(now.getTime() + NOTIFICATION_TRANSPORT_LEASE_MS),
        leaseToken, status: "sending", updatedAt: now,
      }).where(and(
        eq(notificationTransportOutbox.eventId, candidate.eventId),
        eq(notificationTransportOutbox.transport, candidate.transport),
        eq(notificationTransportOutbox.recipient, candidate.recipient),
      )).returning()
      if (row) claimed.push(row)
    }
    return claimed
  })
}

export async function completeNotificationTransportMessage(input: {
  eventId: string
  transport: string
  recipient: string
  leaseToken: string
  status: "pending" | "delivered" | "failed"
  nextAttemptAt?: Date
  deliveredAt?: Date | null
  lastError?: string | null
}) {
  const { eventId, leaseToken, recipient, transport, ...values } = input
  const [updated] = await db.update(notificationTransportOutbox).set({
    ...values, leaseExpiresAt: null, leaseToken: null, updatedAt: new Date(),
  }).where(and(
    eq(notificationTransportOutbox.eventId, eventId),
    eq(notificationTransportOutbox.transport, transport),
    eq(notificationTransportOutbox.recipient, recipient),
    eq(notificationTransportOutbox.status, "sending"),
    eq(notificationTransportOutbox.leaseToken, leaseToken),
  )).returning({ eventId: notificationTransportOutbox.eventId })
  return Boolean(updated)
}
