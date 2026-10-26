import { creatorImageBindingFingerprint } from "@/lib/creators/image-fingerprint";
import { and, asc, eq, inArray, sql } from "drizzle-orm";
import { creators, jobRuns, providerCreatorBindings } from "@/db/schema";
import type { CreatorTransaction } from "./creators";
import { createJobRun } from "./jobs";

/** Called inside the transaction that creates a Creator or confirms its identity. */
export async function enqueueCreatorImageFill(tx: CreatorTransaction, creatorId: number) {
  const [creator] = await tx.select({ id: creators.id }).from(creators).where(eq(creators.id, creatorId)).for("update");
  if (!creator) return null;
  // Serialize enqueue attempts, including repeated confirmation of an existing binding.
  await tx.execute(sql`select pg_advisory_xact_lock(hashtextextended(${`creator-image:${creatorId}`}, 0))`);
  const bindings = await tx.select({ id: providerCreatorBindings.id, provider: providerCreatorBindings.provider,
    externalCreatorId: providerCreatorBindings.externalCreatorId }).from(providerCreatorBindings).where(and(
    eq(providerCreatorBindings.creatorId, creatorId), eq(providerCreatorBindings.active, true),
  )).orderBy(asc(providerCreatorBindings.id));
  const bindingFingerprint = creatorImageBindingFingerprint(bindings);
  const [existing] = await tx.select({ id: jobRuns.id }).from(jobRuns).where(and(
    sql`${jobRuns.type} = 'media.creator-image-fill' and ${jobRuns.status} in ('queued','running')`,
    sql`${jobRuns.payload}->>'creatorId' = ${String(creatorId)}`,
    sql`${jobRuns.payload}->>'bindingFingerprint' = ${bindingFingerprint}`,
  )).limit(1);
  if (existing) return existing;
  return createJobRun({ type: "media.creator-image-fill", payload: { creatorId, bindingFingerprint }, source: "event",
    maxAttempts: 3, timeoutSeconds: 300, retryBaseSeconds: 60, retryMaxSeconds: 3600 }, new Date(), tx);
}

/** A roster batch uses the same identity fingerprint and active-job uniqueness without per-owner roundtrips. */
export async function enqueueCreatorImageFills(tx: CreatorTransaction, creatorIds: number[]) {
  const ids = [...new Set(creatorIds)].sort((a, b) => a - b);
  if (!ids.length) return [];
  const owners = await tx.select({ id: creators.id }).from(creators)
    .where(inArray(creators.id, ids)).orderBy(asc(creators.id)).for("update");
  if (!owners.length) return [];
  const ownerIds = owners.map(row => row.id);
  const bindings = await tx.select({ creatorId: providerCreatorBindings.creatorId, id: providerCreatorBindings.id,
    provider: providerCreatorBindings.provider, externalCreatorId: providerCreatorBindings.externalCreatorId })
    .from(providerCreatorBindings).where(and(inArray(providerCreatorBindings.creatorId, ownerIds), eq(providerCreatorBindings.active, true)))
    .orderBy(asc(providerCreatorBindings.id));
  const existing = await tx.select({ payload: jobRuns.payload }).from(jobRuns).where(and(
    sql`${jobRuns.type} = 'media.creator-image-fill' and ${jobRuns.status} in ('queued','running')`,
    inArray(sql`${jobRuns.payload}->>'creatorId'`, ownerIds.map(String)),
  ));
  const active = new Set(existing.map(row => `${row.payload.creatorId}:${row.payload.bindingFingerprint}`));
  const byOwner = new Map<number, typeof bindings>();
  for (const binding of bindings) {
    const group = byOwner.get(binding.creatorId) ?? [];
    group.push(binding);
    byOwner.set(binding.creatorId, group);
  }
  const now = new Date();
  const values = ownerIds.flatMap(creatorId => {
    const bindingFingerprint = creatorImageBindingFingerprint(byOwner.get(creatorId) ?? []);
    return active.has(`${creatorId}:${bindingFingerprint}`) ? [] : [{ type: "media.creator-image-fill",
      payload: { creatorId, bindingFingerprint }, source: "event" as const,
      maxAttempts: 3, timeoutSeconds: 300, retryBaseSeconds: 60, retryMaxSeconds: 3600, availableAt: now, scheduledFor: now }];
  });
  return values.length ? tx.insert(jobRuns).values(values).onConflictDoNothing().returning({ id: jobRuns.id }) : [];
}
