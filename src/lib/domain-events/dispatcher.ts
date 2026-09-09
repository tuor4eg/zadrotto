import "server-only";

import { and, asc, eq, isNull } from "drizzle-orm";

import { db } from "@/db";
import { domainEventConsumptions, domainEventOutbox, domainEvents } from "@/db/schema";
import { isDomainEventType, type PersistedDomainEvent } from "./catalog";
import { enqueueNotificationTransportDelivery } from "./queue";
import { domainEventConsumerRegistry } from "./registry";

const DEFAULT_RECOVERY_BATCH_SIZE = 50;

export async function dispatchDomainEvent(eventId: string) {
  const result = await db.transaction(async (tx) => {
    const [outbox] = await tx.select({ dispatchedAt: domainEventOutbox.dispatchedAt })
      .from(domainEventOutbox)
      .where(eq(domainEventOutbox.eventId, eventId))
      .for("update")
      .limit(1);
    if (!outbox) return { dispatched: false, shouldDeliverNotifications: false };
    if (outbox.dispatchedAt) return { dispatched: true, shouldDeliverNotifications: false };

    const [event] = await tx.select().from(domainEvents).where(eq(domainEvents.id, eventId)).limit(1);
    if (!event) return { dispatched: false, shouldDeliverNotifications: false };
    if (!isDomainEventType(event.type)) {
      throw new Error(`Unsupported domain event type: ${event.type}`);
    }

    const typedEvent = event as PersistedDomainEvent;
    let shouldDeliverNotifications = false;
    for (const consumer of domainEventConsumerRegistry.forType(typedEvent.type)) {
      const [claimedRow] = await tx.insert(domainEventConsumptions).values({
        consumerKey: consumer.key,
        eventId,
      }).onConflictDoNothing().returning({ eventId: domainEventConsumptions.eventId });
      if (!claimedRow) continue;
      await consumer.handle(tx, typedEvent);
      if (consumer.key === "notifications.create") shouldDeliverNotifications = true;
    }

    await tx.update(domainEventOutbox).set({
      dispatchedAt: new Date(),
      updatedAt: new Date(),
    }).where(and(
      eq(domainEventOutbox.eventId, eventId),
      isNull(domainEventOutbox.dispatchedAt),
    ));
    return { dispatched: true, shouldDeliverNotifications };
  });
  if (result.shouldDeliverNotifications) await enqueueNotificationTransportDelivery();
  return result.dispatched;
}

export async function recoverPendingDomainEvents(limit = DEFAULT_RECOVERY_BATCH_SIZE) {
  const safeLimit = Math.max(1, Math.min(limit, 200));
  const rows = await db.select({ eventId: domainEventOutbox.eventId })
    .from(domainEventOutbox)
    .where(isNull(domainEventOutbox.dispatchedAt))
    .orderBy(asc(domainEventOutbox.createdAt))
    .limit(safeLimit);

  for (const row of rows) {
    try {
      await dispatchDomainEvent(row.eventId);
    } catch (error) {
      // A poison event must not starve newer outbox records. It remains pending
      // for a later retry while recovery continues with the rest of the batch.
      console.error("Failed to recover pending domain event", { error, eventId: row.eventId });
    }
  }
  return rows.length;
}
