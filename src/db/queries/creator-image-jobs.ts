import { creatorImageBindingFingerprint } from "@/lib/creators/image-fingerprint";
import { and, asc, eq, sql } from "drizzle-orm";
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
