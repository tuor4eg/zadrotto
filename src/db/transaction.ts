import { sql } from "drizzle-orm";

import { db } from "@/db";
import type { DomainEventInput, DomainEventType, PersistedDomainEvent } from "@/lib/domain-events/catalog";
import { appendDomainEvent } from "@/lib/domain-events/persistence";
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
  ) => Promise<TResult>,
) {
  const eventIds: string[] = [];
  const result = await db.transaction(async (tx) => callback(tx, async (event) => {
    const persisted = await appendDomainEvent(tx, event);
    eventIds.push(persisted.id);
    return persisted;
  }));

  await Promise.all(eventIds.map(enqueueDomainEventDispatch));
  return result;
}

export async function lockAuthorForTransaction(tx: DbTransaction, authorId: number) {
  await tx.execute(
    sql`select pg_advisory_xact_lock(${AUTHOR_ADVISORY_LOCK_NAMESPACE}, ${authorId})`,
  );
}
