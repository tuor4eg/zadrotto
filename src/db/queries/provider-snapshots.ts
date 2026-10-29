import { and, asc, eq, inArray, sql } from "drizzle-orm";
import { db } from "@/db";
import { jobRuns, providerPartSnapshotLinks as partLinks, providerSnapshotLinks as links, providerSnapshots as snapshots, titleParts } from "@/db/schema";
import type { DbTransaction } from "@/db/transaction";
import { canonicalSnapshotEntity, lockSnapshotEntity, type SnapshotActor, type SnapshotEntity } from "@/lib/providers/entities";
import type { RawSnapshot, SnapshotDescriptor } from "@/lib/providers/types";
import { snapshotHash, type SnapshotReference } from "@/lib/providers/snapshot-values";
import { JobError } from "@/lib/jobs/types";

export type StoredProviderSnapshot = typeof snapshots.$inferSelect;
export type SnapshotJobGuard = { runId: number; lockToken: string };

export async function guardSnapshotJob(tx: DbTransaction, guard?: SnapshotJobGuard) {
  if (!guard) return;
  // Bound waiting for another mutation of this run, including a paused old owner.
  await tx.execute(sql`select set_config('lock_timeout', '1000ms', true)`);
  const [run] = await tx.select({id:jobRuns.id}).from(jobRuns).where(and(eq(jobRuns.id,guard.runId),eq(jobRuns.status,"running"),eq(jobRuns.lockToken,guard.lockToken))).for("update");
  if (!run) throw new JobError("lease-lost", "STALE_SNAPSHOT_JOB", { retryable: false });
  // Read the DB clock after acquiring the lock, not before a possible lock wait.
  const [deadline] = await tx.execute<{ remaining: number }>(sql`
    select floor(extract(epoch from (lock_expires_at - clock_timestamp())) * 1000)::integer as remaining
    from ${jobRuns} where id = ${guard.runId}
  `);
  if (!deadline || deadline.remaining <= 0) throw new JobError("lease-lost", "STALE_SNAPSHOT_JOB", { retryable: false });
  await tx.execute(sql`select set_config('statement_timeout', ${`${deadline.remaining}ms`}, true),
    set_config('idle_in_transaction_session_timeout', ${`${deadline.remaining}ms`}, true)`);
}

/** Existing fencing protocol, shared by short mutations; never put HTTP in work. */
export async function withSnapshotJobGuard<T>(guard: SnapshotJobGuard | undefined, work: (tx: DbTransaction) => Promise<T>): Promise<T> {
  return db.transaction(async tx => {
    await guardSnapshotJob(tx, guard);
    const result = await work(tx);
    await guardSnapshotJob(tx, guard);
    return result;
  });
}
export async function providerRequestStartedAt() {
  const [row] = await db.execute<{now: string}>(sql`select clock_timestamp()::timestamp(3) with time zone as now`);
  return new Date(row.now);
}
function descriptorCondition(input: SnapshotDescriptor) {
  return and(eq(snapshots.providerCode,input.providerCode),eq(snapshots.resourceType,input.resourceType),eq(snapshots.externalId,input.externalId),eq(snapshots.apiMethod,input.apiMethod),eq(snapshots.requestKey,snapshotHash(input.requestParams)));
}
export async function getProviderSnapshot(input: SnapshotDescriptor, tx: DbTransaction | typeof db = db) {
  return (await tx.select().from(snapshots).where(descriptorCondition(input)).limit(1))[0] ?? null;
}
export async function saveProviderSnapshot(input: RawSnapshot, guard?: SnapshotJobGuard): Promise<StoredProviderSnapshot> {
  return withSnapshotJobGuard(guard, tx => upsertProviderSnapshot(tx, input));
}
async function upsertProviderSnapshot(tx: DbTransaction, input: RawSnapshot): Promise<StoredProviderSnapshot> {
  if ([input.providerCode,input.resourceType,input.externalId,input.apiMethod].some((value)=>!value.trim())) throw new Error("INVALID_SNAPSHOT_DESCRIPTOR");
  const [saved] = await tx.insert(snapshots).values({providerCode:input.providerCode,resourceType:input.resourceType,externalId:input.externalId,apiMethod:input.apiMethod,
    requestParams:input.requestParams,requestKey:snapshotHash(input.requestParams),payload:input.payload,payloadHash:snapshotHash(input.payload),contentType:input.contentType,
    requestStartedAt:input.requestStartedAt,fetchedAt:input.fetchedAt})
    .onConflictDoUpdate({target:[snapshots.providerCode,snapshots.resourceType,snapshots.externalId,snapshots.apiMethod,snapshots.requestKey],set:{payload:input.payload,payloadHash:snapshotHash(input.payload),contentType:input.contentType,requestStartedAt:input.requestStartedAt,fetchedAt:input.fetchedAt},setWhere:sql`${snapshots.requestStartedAt} < ${input.requestStartedAt.toISOString()}::timestamptz`}).returning();
  return saved ?? (await getProviderSnapshot(input,tx))!;
}
export async function savePartProviderSnapshot(mediaItemId: number, input: RawSnapshot, actor: SnapshotActor, guard?: SnapshotJobGuard) {
  return withSnapshotJobGuard(guard, async tx => {
    await lockSnapshotEntity(tx, { entityType: "media-item", entityId: String(mediaItemId) }, actor);
    const snapshot = await upsertProviderSnapshot(tx, input);
    await tx.insert(partLinks).values({ mediaItemId, snapshotId: snapshot.id }).onConflictDoNothing();
    return snapshot;
  });
}
export async function attachPartProviderSnapshot(tx: DbTransaction, mediaItemId: number, ref: SnapshotReference) {
  await lockSnapshotEntity(tx, { entityType: "media-item", entityId: String(mediaItemId) }, { kind: "system" });
  await lockProviderSnapshotReferences(tx, [ref]);
  await tx.insert(partLinks).values({ mediaItemId, snapshotId: ref.id }).onConflictDoNothing();
}
export async function getPartProviderSnapshots(mediaItemId: number, identity?: { providerCode: string; externalId: string }) {
  return db.select({ snapshot: snapshots, partId: partLinks.partId }).from(partLinks)
    .innerJoin(snapshots, eq(snapshots.id, partLinks.snapshotId))
    .where(and(eq(partLinks.mediaItemId, mediaItemId), identity ? eq(snapshots.providerCode, identity.providerCode) : undefined,
      identity ? eq(snapshots.externalId, identity.externalId) : undefined)).orderBy(asc(snapshots.id));
}
export async function bindPartProviderSnapshot(mediaItemId: number, snapshotId: number, partId: number | null, actor: SnapshotActor) {
  return db.transaction(async tx => {
    await lockSnapshotEntity(tx, { entityType: "media-item", entityId: String(mediaItemId) }, actor);
    if (partId !== null) {
      const [part] = await tx.select({ id: titleParts.id }).from(titleParts)
        .where(and(eq(titleParts.mediaItemId, mediaItemId), eq(titleParts.id, partId))).for("update");
      if (!part) throw new Error("SNAPSHOT_PART_NOT_FOUND");
    }
    const [link] = await tx.update(partLinks).set({ partId }).where(and(eq(partLinks.mediaItemId, mediaItemId), eq(partLinks.snapshotId, snapshotId))).returning();
    if (!link) throw new Error("SNAPSHOT_PART_LINK_NOT_FOUND");
    return link;
  });
}
export async function lockProviderSnapshotReferences(tx: DbTransaction, refs: SnapshotReference[]) {
  const rows = refs.length ? await tx.select().from(snapshots).where(inArray(snapshots.id,refs.map(ref=>ref.id))).orderBy(asc(snapshots.id)).for("share") : [];
  if (rows.length !== refs.length || rows.some(row=>refs.find(ref=>ref.id===row.id)?.payloadHash!==row.payloadHash)) throw new Error("PROVIDER_SNAPSHOT_CHANGED");
  return rows;
}
export async function attachProviderSnapshots(tx: DbTransaction, entity: SnapshotEntity, refs: Array<SnapshotReference & {purpose:"primary"|"dependency"}>, actor: SnapshotActor) {
  const target = await lockSnapshotEntity(tx,entity,actor);
  await lockProviderSnapshotReferences(tx,refs);
  if (refs.length) await tx.insert(links).values(refs.map(ref=>({snapshotId:ref.id,...target,purpose:ref.purpose}))).onConflictDoNothing();
}
export async function deleteEntitySnapshotLinks(tx: DbTransaction, entity: SnapshotEntity) {
  const target = await lockSnapshotEntity(tx,entity,{kind:"system"});
  await tx.delete(links).where(and(eq(links.entityType,target.entityType),eq(links.entityId,target.entityId)));
}
export async function moveEntitySnapshotLinks(tx: DbTransaction, from: SnapshotEntity, to: SnapshotEntity) {
  const targets = [canonicalSnapshotEntity(from),canonicalSnapshotEntity(to)];
  if (targets[0].entityType !== targets[1].entityType) throw new Error("SNAPSHOT_ENTITY_TYPE_MISMATCH");
  for (const target of [...targets].sort((a,b)=>a.entityId.localeCompare(b.entityId))) await lockSnapshotEntity(tx,target,{kind:"system"});
  const rows = await tx.select().from(links).where(and(eq(links.entityType,targets[0].entityType),eq(links.entityId,targets[0].entityId)));
  if (rows.length) await tx.insert(links).values(rows.map(row=>({...row,...targets[1]}))).onConflictDoNothing();
  if (targets[0].entityId !== targets[1].entityId) await tx.delete(links).where(and(eq(links.entityType,targets[0].entityType),eq(links.entityId,targets[0].entityId)));
}
export async function getEntitySnapshotHeaders(entity: SnapshotEntity) {
  const target = canonicalSnapshotEntity(entity);
  return db.select({id:snapshots.id,providerCode:snapshots.providerCode,resourceType:snapshots.resourceType,externalId:snapshots.externalId,apiMethod:snapshots.apiMethod,payloadHash:snapshots.payloadHash,fetchedAt:snapshots.fetchedAt,purpose:links.purpose})
    .from(links).innerJoin(snapshots,eq(snapshots.id,links.snapshotId)).where(and(eq(links.entityType,target.entityType),eq(links.entityId,target.entityId))).orderBy(asc(snapshots.id));
}

/** Caller has already locked and deleted the target row in this transaction. */
export async function clearDeletedEntitySnapshotLinks(tx: DbTransaction, entity: SnapshotEntity) {
  const target = canonicalSnapshotEntity(entity);
  await tx.delete(links).where(and(eq(links.entityType,target.entityType),eq(links.entityId,target.entityId)));
}
