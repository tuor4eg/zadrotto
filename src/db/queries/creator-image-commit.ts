import { and, asc, eq, isNull } from "drizzle-orm";
import { db } from "@/db";
import { creators, creatorTypes, jobRuns, providerCreatorBindings, providerCreatorMappings, providerSnapshotLinks } from "@/db/schema";
import { lockProviderSnapshotReferences, withSnapshotJobGuard, type SnapshotJobGuard } from "./provider-snapshots";
import { creatorProfileDescriptor, type CreatorProfileTarget } from "@/lib/providers/creator-profile-targets";
import { snapshotHash, type SnapshotReference } from "@/lib/providers/snapshot-values";
import { canWriteCreatorImage, type ImageBinding } from "@/lib/creators/image-policy";

export function creatorImageStateQuery(creatorId: number) {
  return db.select({ creator: creators, typeCode: creatorTypes.code }).from(creators).innerJoin(creatorTypes, eq(creatorTypes.id, creators.typeId)).where(eq(creators.id, creatorId));
}
export function creatorImageBindingsQuery(creatorId: number) {
  return db.select().from(providerCreatorBindings).where(and(eq(providerCreatorBindings.creatorId, creatorId), eq(providerCreatorBindings.active, true))).orderBy(asc(providerCreatorBindings.id));
}
export const imageBindingKey = (bindings: ImageBinding[]) => JSON.stringify(bindings.map(b => [b.id, b.provider, b.externalCreatorId]).sort((a, b) => Number(a[0]) - Number(b[0])));
export async function commitCreatorImage(input: {
  refresh?: boolean; creatorId: number; expectedVersion: number; typeCode: string; binding: ImageBinding; bindings: ImageBinding[];
  target: CreatorProfileTarget; snapshot: SnapshotReference; objectKey: string; contentHash: string;
  originalUrl: string; sourceUrl: string; guard?: SnapshotJobGuard; checkpoint?: Record<string, unknown>;
}) {
  return withSnapshotJobGuard(input.guard, async tx => {
    const [row] = await tx.select({ creator: creators, typeCode: creatorTypes.code }).from(creators).innerJoin(creatorTypes, eq(creatorTypes.id, creators.typeId))
      .where(eq(creators.id, input.creatorId)).for("update", { of: creators });
    if (!row || row.typeCode !== input.typeCode || row.creator.avatarVersion !== input.expectedVersion || !canWriteCreatorImage(row.creator, input.refresh ? input.binding : undefined)) return false;
    const bindings = await tx.select().from(providerCreatorBindings).where(and(eq(providerCreatorBindings.creatorId, input.creatorId), eq(providerCreatorBindings.active, true)))
      .orderBy(asc(providerCreatorBindings.id)).for("share");
    if (imageBindingKey(bindings) !== imageBindingKey(input.bindings)) return false;
    if (input.target.provider === "fantlab") {
      const unresolved = await tx.select({ id: providerCreatorMappings.id }).from(providerCreatorMappings).where(and(eq(providerCreatorMappings.creatorId, input.creatorId), eq(providerCreatorMappings.provider, "fantlab"), isNull(providerCreatorMappings.bindingId))).limit(1);
      if (unresolved.length) return false;
    }
    const [snapshot] = await lockProviderSnapshotReferences(tx, [input.snapshot]);
    const expected = creatorProfileDescriptor(input.target);
    if (snapshot.providerCode !== expected.providerCode || snapshot.resourceType !== expected.resourceType || snapshot.externalId !== expected.externalId || snapshot.apiMethod !== expected.apiMethod || snapshot.requestKey !== snapshotHash(expected.requestParams)) return false;
    const [link] = await tx.select({ id: providerSnapshotLinks.snapshotId }).from(providerSnapshotLinks).where(and(eq(providerSnapshotLinks.snapshotId, input.snapshot.id), eq(providerSnapshotLinks.entityType, "creator"), eq(providerSnapshotLinks.entityId, String(input.creatorId)), eq(providerSnapshotLinks.purpose, "primary"))).limit(1);
    if (!link) return false;
    await tx.update(creators).set({ avatarObjectKey: input.objectKey, avatarContentHash: input.contentHash, avatarSource: input.target.provider,
      avatarSourceExternalId: input.binding.externalCreatorId, avatarOriginalUrl: input.originalUrl, avatarSourceUrl: input.sourceUrl,
      avatarFetchedAt: new Date(), avatarVersion: row.creator.avatarVersion + 1, updatedAt: new Date() }).where(eq(creators.id, input.creatorId));
    if (input.guard && input.checkpoint) await tx.update(jobRuns).set({ payload: input.checkpoint, updatedAt: new Date() }).where(eq(jobRuns.id, input.guard.runId));
    return true;
  });
}
