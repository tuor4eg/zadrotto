import { sql } from "drizzle-orm";

import { db } from "@/db";
import type { DomainEventInput, DomainEventType, PersistedDomainEvent } from "@/lib/domain-events/catalog";
import { appendDomainEvent, appendDomainEvents } from "@/lib/domain-events/persistence";
import { enqueueDomainEventDispatch } from "@/lib/domain-events/queue";

export type DbTransaction = Parameters<Parameters<typeof db.transaction>[0]>[0];

const AUTHOR_ADVISORY_LOCK_NAMESPACE = 42_001;

export function runInTransaction<TResult>(
  callback: (tx: DbTransaction) => Promise<TResult>,
) {
  return db.transaction(callback);
}

export async function runInDomainEventTransaction<TResult>(
  callback: (
    tx: DbTransaction,
    append: <TType extends DomainEventType>(
      event: DomainEventInput<TType>,
    ) => Promise<PersistedDomainEvent<TType>>,
    appendMany: <TType extends DomainEventType>(
      events: DomainEventInput<TType>[],
    ) => Promise<PersistedDomainEvent<TType>[]>,
  ) => Promise<TResult>,
  onStage?: (name: string) => void,
) {
  const eventIds: string[] = [];
  onStage?.("transaction.acquireAndBegin");
  const result = await db.transaction(async (tx) => {
    onStage?.("transaction.callback");
    const value = await callback(
      tx,
      async (event) => {
        const persisted = await appendDomainEvent(tx, event);
        eventIds.push(persisted.id);
        return persisted;
      },
      async (events) => {
        const persisted = await appendDomainEvents(tx, events);
        eventIds.push(...persisted.map((event) => event.id));
        return persisted;
      },
    );
    onStage?.("transaction.commit");
    return value;
  });

  onStage?.("domainEventDispatch.enqueue");
  await Promise.all(eventIds.map(id => enqueueDomainEventDispatch(id)));
  onStage?.("domainEventDispatch.finished");
  return result;
}

export async function lockAuthorForTransaction(tx: DbTransaction, authorId: number) {
  await tx.execute(
    sql`select pg_advisory_xact_lock(${AUTHOR_ADVISORY_LOCK_NAMESPACE}, ${authorId})`,
  );
}
