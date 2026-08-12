import "server-only";

import { eq } from "drizzle-orm";

import { domainEventOutbox, domainEvents } from "@/db/schema";
import type { DbTransaction } from "@/db/transaction";
import type { DomainEventInput, DomainEventType, PersistedDomainEvent } from "./catalog";

export async function appendDomainEvent<TType extends DomainEventType>(
  tx: DbTransaction,
  input: DomainEventInput<TType>,
): Promise<PersistedDomainEvent<TType>> {
  const [event] = await tx.insert(domainEvents).values({
    actorAuthorId: input.actorAuthorId,
    aggregateId: input.aggregateId,
    aggregateType: input.aggregateType,
    occurredAt: input.occurredAt,
    payload: input.payload,
    schemaVersion: input.schemaVersion ?? 1,
    type: input.type,
  }).returning();

  await tx.insert(domainEventOutbox).values({ eventId: event.id });
  return event as PersistedDomainEvent<TType>;
}

export async function getDomainEvent(tx: DbTransaction, eventId: string) {
  const [event] = await tx.select().from(domainEvents).where(eq(domainEvents.id, eventId)).limit(1);
  return event ?? null;
}
