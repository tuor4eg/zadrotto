import "server-only";

import { eq, sql } from "drizzle-orm";
import { authors } from "@/db/schema";
import { lockAuthorForTransaction, type DbTransaction } from "@/db/transaction";
import { lockReputationForConsumer } from "@/lib/reputation/initialize";
import type { PersistedDomainEvent } from "./catalog";

/** Project identity references for consumers, preserving the persisted historical fact. */
export async function projectMergedAccountEvent(tx: DbTransaction, event: PersistedDomainEvent): Promise<PersistedDomainEvent | null> {
  await lockReputationForConsumer(tx);
  const fields = ["authorId", "acceptedByAuthorId", "requestedByAuthorId"];
  const payload: Record<string, unknown> = { ...event.payload };
  const ids = new Set<number>();
  if (event.actorAuthorId) ids.add(event.actorAuthorId);
  for (const field of fields) if (typeof payload[field] === "number") ids.add(payload[field] as number);
  const resolved = new Map<number, number>();
  for (const original of [...ids].sort((a, b) => a - b)) {
    let current = original;
    const visited = new Set<number>();
    for (;;) {
      if (visited.has(current) || visited.size >= 100) throw new Error("Invalid merged author chain");
      visited.add(current);
      await lockAuthorForTransaction(tx, current);
      const [author] = await tx.select({ target: authors.mergedIntoAuthorId }).from(authors).where(eq(authors.id, current)).for("update");
      if (!author || author.target === null) break;
      current = author.target;
    }
    resolved.set(original, current);
  }
  const archivedTable = event.type === "rating.created" ? "ratings"
    : event.type.startsWith("review.") ? "contributions" : null;
  if (archivedTable) {
    const key = "contributionId" in payload ? String(payload.contributionId) : event.aggregateId;
    const discarded = await tx.execute(sql`select 1 from account_merge_archive
      where table_name = ${archivedTable} and entity_key = ${key} limit 1`);
    if (Array.from(discarded).length) return null;
  }
  for (const field of fields) {
    const value = payload[field];
    if (typeof value === "number") payload[field] = resolved.get(value) ?? value;
  }
  const actorAuthorId = event.actorAuthorId ? resolved.get(event.actorAuthorId) ?? event.actorAuthorId : null;
  const aggregateId = event.aggregateType === "author" && resolved.has(Number(event.aggregateId))
    ? String(resolved.get(Number(event.aggregateId))) : event.aggregateId;
  return { ...event, actorAuthorId, aggregateId, payload } as PersistedDomainEvent;
}
