import { and, asc, desc, eq, gt, lte } from "drizzle-orm";
import { db } from "@/db";
import { creators, creatorTypes, jobRuns } from "@/db/schema";
import { withSnapshotJobGuard, type SnapshotJobGuard } from "./provider-snapshots";
import type { CreatorImagesReconcilePayload } from "@/lib/covers/creator-images-reconcile-model";

// Unfiltered PK window bounds scan work independently of sparse avatar eligibility.
export async function creatorImagesReconcileUpperId(creatorId?: number) {
  const [row] = await db.select({ id: creators.id }).from(creators).where(creatorId ? eq(creators.id, creatorId) : undefined).orderBy(desc(creators.id)).limit(1);
  return row?.id ?? 0;
}
export function creatorImagesReconcileBatch(input: { afterId: number; throughId: number; batchSize: number; creatorId?: number }) {
  return db.select({ creator: creators, typeCode: creatorTypes.code }).from(creators).innerJoin(creatorTypes, eq(creatorTypes.id, creators.typeId))
    .where(and(gt(creators.id, input.afterId), lte(creators.id, input.throughId), input.creatorId ? eq(creators.id, input.creatorId) : undefined)).orderBy(asc(creators.id)).limit(input.batchSize + 1);
}
export type CreatorImagesReconcileRow = Awaited<ReturnType<typeof creatorImagesReconcileBatch>>[number];
export async function saveCreatorImagesReconcileCheckpoint(guard: SnapshotJobGuard, payload: CreatorImagesReconcilePayload) {
  await withSnapshotJobGuard(guard, async tx => { await tx.update(jobRuns).set({ payload, updatedAt: new Date() }).where(eq(jobRuns.id, guard.runId)); });
}
const sourceFields = ["typeId", "avatarVersion", "avatarObjectKey", "avatarSource", "avatarSourceExternalId", "avatarSourceUrl", "avatarOriginalUrl", "avatarContentHash", "avatarFetchedAt"] as const;
export function creatorImageReconcileStateMatches(current: CreatorImagesReconcileRow["creator"], expected: CreatorImagesReconcileRow["creator"]) {
  return sourceFields.every(key => {
    const a = current[key], b = expected[key];
    return a instanceof Date && b instanceof Date ? a.getTime() === b.getTime() : a === b;
  });
}
export async function commitCreatorImagesReconcile(input: { row: CreatorImagesReconcileRow; objectKey: string; contentHash: string; guard: SnapshotJobGuard; payload: CreatorImagesReconcilePayload; signal: AbortSignal }) {
  return withSnapshotJobGuard(input.guard, async tx => {
    const [current] = await tx.select().from(creators).where(eq(creators.id, input.row.creator.id)).for("update");
    input.signal.throwIfAborted();
    if (!current || !creatorImageReconcileStateMatches(current, input.row.creator)) return false;
    await tx.update(creators).set({ avatarObjectKey: input.objectKey, avatarContentHash: input.contentHash, avatarVersion: current.avatarVersion + 1, updatedAt: new Date() }).where(eq(creators.id, current.id));
    input.signal.throwIfAborted();
    await tx.update(jobRuns).set({ payload: input.payload, updatedAt: new Date() }).where(eq(jobRuns.id, input.guard.runId));
    return true;
  });
}

/** Only used for an unsuccessful attempt; the unique avatar index bounds the reference lookup. */
export async function creatorImagesReconcileUploadReferenced(creatorId: number, objectKey: string) {
  return db.transaction(async tx => {
    await tx.select({ id: creators.id }).from(creators).where(eq(creators.id, creatorId)).for("update");
    const [reference] = await tx.select({ id: creators.id }).from(creators).where(eq(creators.avatarObjectKey, objectKey)).limit(1);
    return Boolean(reference);
  });
}
