import "server-only";

import { and, asc, eq, isNull, sql } from "drizzle-orm";
import { db } from "@/db";
import { domainEventConsumptions, domainEventOutbox, domainEvents } from "@/db/schema";
import { guardSnapshotJob, withSnapshotJobGuard, type SnapshotJobGuard } from "@/db/queries/provider-snapshots";
import { logSystemActivity } from "@/lib/activity-logs/system";
import { JobError } from "@/lib/jobs/types";
import { isDomainEventType, type PersistedDomainEvent } from "./catalog";
import { enqueueDomainEventDispatch, enqueueNotificationTransportDelivery } from "./queue";
import { domainEventConsumerRegistry } from "./registry";

const DEFAULT_RECOVERY_BATCH_SIZE = 50;
export const DOMAIN_EVENT_BACKOFF_SECONDS = 60;
type DispatchContext = { jobGuard?: SnapshotJobGuard; signal?: AbortSignal };

export async function dispatchDomainEvent(eventId: string, context: DispatchContext = {}) {
  context.signal?.throwIfAborted();
  // Commit the cooldown BEFORE consumers: even a killed process cannot keep a
  // poison event at the front of every recovery batch.
  const admitted = await withSnapshotJobGuard(context.jobGuard, async tx => {
    const [row] = await tx.select({ createdAt: domainEventOutbox.createdAt })
      .from(domainEventOutbox).where(and(eq(domainEventOutbox.eventId, eventId),
        isNull(domainEventOutbox.dispatchedAt), sql`${domainEventOutbox.nextAttemptAt} <= clock_timestamp()`))
      .for("update", { skipLocked: true }).limit(1);
    if (!row) return null;
    await tx.update(domainEventOutbox).set({
      nextAttemptAt: sql`clock_timestamp() + interval '60 seconds'`, updatedAt: sql`clock_timestamp()`,
    }).where(eq(domainEventOutbox.eventId, eventId));
    return row;
  });
  if (!admitted) return false;

  let consumerKey: string | null = null;
  let eventType: string | null = null;
  let result;
  try {
    context.signal?.throwIfAborted();
    result = await withSnapshotJobGuard(context.jobGuard, async tx => {
      const [outbox] = await tx.select({ dispatchedAt: domainEventOutbox.dispatchedAt })
        .from(domainEventOutbox).where(eq(domainEventOutbox.eventId, eventId))
        .for("update", { skipLocked: true }).limit(1);
      if (!outbox || outbox.dispatchedAt) return { dispatched: false, followUpEventIds: [] as string[], shouldDeliverNotifications: false };
      const [event] = await tx.select().from(domainEvents).where(eq(domainEvents.id, eventId)).limit(1);
      if (!event) throw new JobError("event-missing", "Доменное событие отсутствует.", { retryable: false });
      eventType = event.type;
      if (!isDomainEventType(event.type)) throw new JobError("event-type-unsupported", "Неизвестный тип доменного события.", { retryable: false });
      const typedEvent = event as PersistedDomainEvent;
      const followUpEventIds: string[] = [];
      let shouldDeliverNotifications = false;
      for (const consumer of domainEventConsumerRegistry.forType(typedEvent.type)) {
        context.signal?.throwIfAborted();
        consumerKey = consumer.key;
        const [claimedRow] = await tx.insert(domainEventConsumptions).values({ consumerKey: consumer.key, eventId })
          .onConflictDoNothing().returning({ eventId: domainEventConsumptions.eventId });
        if (!claimedRow) continue;
        const producedEventIds = await consumer.handle(tx, typedEvent);
        if (producedEventIds) followUpEventIds.push(...producedEventIds);
        if (consumer.key === "notifications.create") shouldDeliverNotifications = true;
      }
      context.signal?.throwIfAborted();
      await guardSnapshotJob(tx, context.jobGuard);
      await tx.update(domainEventOutbox).set({ dispatchedAt: new Date(), updatedAt: new Date() })
        .where(and(eq(domainEventOutbox.eventId, eventId), isNull(domainEventOutbox.dispatchedAt)));
      return { dispatched: true, followUpEventIds, shouldDeliverNotifications };
    });
  } catch (error) {
    if (context.signal?.aborted || (error instanceof JobError && error.code === "lease-lost")) throw error;
    const nextAttemptAt = await withSnapshotJobGuard(context.jobGuard, async tx => {
      const [row] = await tx.update(domainEventOutbox).set({
        nextAttemptAt: sql`greatest(${domainEventOutbox.nextAttemptAt}, clock_timestamp() + interval '60 seconds')`,
        updatedAt: sql`clock_timestamp()`,
      }).where(and(eq(domainEventOutbox.eventId, eventId), isNull(domainEventOutbox.dispatchedAt)))
        .returning({ nextAttemptAt: domainEventOutbox.nextAttemptAt });
      return row?.nextAttemptAt ?? null;
    });
    const errorCode = error instanceof JobError ? error.code : "consumer-failed";
    await logSystemActivity({ action: "domain-event.dispatch.failed", entityType: "job-run",
      entityId: context.jobGuard?.runId ?? null, status: "failure", severity: "warning",
      message: "Ошибка обработки доменного события. Повтор выполняется через outbox.",
      metadata: { eventId, eventType, runId: context.jobGuard?.runId ?? null, consumerKey, errorCode,
        ageSeconds: Math.max(0, Math.floor((Date.now() - admitted.createdAt.getTime()) / 1000)),
        nextAttemptAt: nextAttemptAt?.toISOString() ?? null },
    });
    throw new JobError("event-delivery-failed", "Ошибка обработки события. Подробнее: /admin/activity. Повтор управляется outbox.", { retryable: false });
  }
  await Promise.all(result.followUpEventIds.map(id => enqueueDomainEventDispatch(id, context.jobGuard)));
  if (result.shouldDeliverNotifications) await enqueueNotificationTransportDelivery(context.jobGuard);
  return result.dispatched;
}

export async function recoverPendingDomainEvents(limit = DEFAULT_RECOVERY_BATCH_SIZE, context: DispatchContext = {}) {
  const safeLimit = Math.max(1, Math.min(limit, 200));
  const rows = await db.select({ eventId: domainEventOutbox.eventId }).from(domainEventOutbox)
    .where(and(isNull(domainEventOutbox.dispatchedAt), sql`${domainEventOutbox.nextAttemptAt} <= statement_timestamp()`))
    .orderBy(asc(domainEventOutbox.nextAttemptAt), asc(domainEventOutbox.eventId)).limit(safeLimit);
  let dispatched = 0;
  let failed = 0;
  for (const row of rows) {
    context.signal?.throwIfAborted();
    try { if (await dispatchDomainEvent(row.eventId, context)) dispatched += 1; }
    catch (error) {
      if (context.signal?.aborted || (error instanceof JobError && error.code === "lease-lost")) throw error;
      // Persisted cooldown and consumption transaction remain the delivery guarantee.
      failed += 1;
    }
  }
  return { examined: rows.length, dispatched, failed };
}
