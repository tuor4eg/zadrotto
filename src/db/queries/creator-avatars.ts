import { enqueueCreatorImageFill } from "./creator-image-jobs";
import { withSnapshotJobGuard, type SnapshotJobGuard } from "@/db/queries/provider-snapshots";
import { and, asc, eq, exists, gt, inArray, isNull, or, sql } from "drizzle-orm";
import { db } from "@/db";
import { creators, creatorTypes, providerCreatorBindings, providerCreatorMappings } from "@/db/schema";

export async function getCreatorAvatarState(id: number) {
  const [creator] = await db.select().from(creators).where(eq(creators.id, id));
  return creator ?? null;
}

export async function getCreatorFantlabBindings(creatorId: number) {
  return db.select().from(providerCreatorBindings).where(and(
    eq(providerCreatorBindings.creatorId, creatorId), eq(providerCreatorBindings.provider, "fantlab"), eq(providerCreatorBindings.active, true),
  )).orderBy(asc(providerCreatorBindings.id));
}

export async function getCreatorFantlabMappings(creatorId: number) {
  return db.select().from(providerCreatorMappings).where(and(
    eq(providerCreatorMappings.creatorId, creatorId), eq(providerCreatorMappings.provider, "fantlab"),
  )).orderBy(asc(providerCreatorMappings.id));
}

export async function getFantlabCreatorBatch(afterId: number, creatorId?: number) {
  return db.select({ id: creators.id }).from(creators).where(and(
    gt(creators.id, afterId), creatorId === undefined ? undefined : eq(creators.id, creatorId),
    or(
      exists(db.select({ id: providerCreatorMappings.id }).from(providerCreatorMappings).where(and(
        eq(providerCreatorMappings.creatorId, creators.id), eq(providerCreatorMappings.provider, "fantlab"),
      ))),
      exists(db.select({ id: providerCreatorBindings.id }).from(providerCreatorBindings).where(and(
        eq(providerCreatorBindings.creatorId, creators.id), eq(providerCreatorBindings.provider, "fantlab"), eq(providerCreatorBindings.active, true),
      ))),
    ),
  )).orderBy(asc(creators.id)).limit(50);
}

/** Creator row serializes binding changes and all avatar assignments; no network inside. */
export async function assignFantlabCreatorBinding(input: {
  jobGuard?: SnapshotJobGuard;
  creatorId: number; externalCreatorId: string; mappingId?: number;
  mappingIds?: number[]; expectedVersion?: number;
}) {
  if (!/^[1-9]\d*$/.test(input.externalCreatorId) || !Number.isSafeInteger(Number(input.externalCreatorId))) throw new Error("Некорректный FantLab ID.");
  return withSnapshotJobGuard(input.jobGuard, async tx => {
    const [owner] = await tx.select({ creator: creators, typeCode: creatorTypes.code }).from(creators)
      .innerJoin(creatorTypes, eq(creatorTypes.id, creators.typeId)).where(eq(creators.id, input.creatorId)).for("update", { of: creators });
    if (!owner || !["person", "collective"].includes(owner.typeCode)) throw new Error("FantLab ID автора доступен только людям и коллективам.");
    const creator = owner.creator;
    if (!creator || (input.expectedVersion !== undefined && creator.avatarVersion !== input.expectedVersion)) throw new Error("Создатель изменился. Повторите операцию.");
    const mappingIds = input.mappingIds ?? (input.mappingId ? [input.mappingId] : []);
    const mappings = mappingIds.length ? await tx.select().from(providerCreatorMappings).where(and(
      eq(providerCreatorMappings.creatorId, input.creatorId), eq(providerCreatorMappings.provider, "fantlab"), inArray(providerCreatorMappings.id, mappingIds),
    )).for("update") : [];
    if (mappings.length !== new Set(mappingIds).size) throw new Error("Привязка изменилась.");
    // Never overwrite an already confirmed mapping during automatic migration.
    if (input.expectedVersion !== undefined && mappings.some(mapping => mapping.bindingId !== null)) throw new Error("Привязка уже подтверждена.");
    await tx.insert(providerCreatorBindings).values({ provider: "fantlab", externalCreatorId: input.externalCreatorId, creatorId: input.creatorId }).onConflictDoNothing();
    const [binding] = await tx.select().from(providerCreatorBindings).where(and(
      eq(providerCreatorBindings.provider, "fantlab"), eq(providerCreatorBindings.active, true), eq(providerCreatorBindings.externalCreatorId, input.externalCreatorId),
    ));
    if (!binding || binding.creatorId !== input.creatorId) throw new Error("Этот FantLab ID уже принадлежит другому создателю.");
    if (mappingIds.length) await tx.update(providerCreatorMappings).set({ bindingId: binding.id, updatedAt: new Date() }).where(inArray(providerCreatorMappings.id, mappingIds));
    await tx.update(creators).set({ avatarVersion: sql`${creators.avatarVersion} + 1`, updatedAt: new Date() }).where(eq(creators.id, input.creatorId));
    await enqueueCreatorImageFill(tx, creator.id);
    return binding;
  });
}

const emptyAvatar = {
  avatarObjectKey: null, avatarSource: null, avatarContentHash: null,
  avatarSourceExternalId: null, avatarSourceUrl: null, avatarOriginalUrl: null, avatarFetchedAt: null,
};

export async function assignManualCreatorAvatar(id: number, input: { objectKey: string; contentHash: string }) {
  return db.transaction(async tx => {
    const [creator] = await tx.select().from(creators).where(eq(creators.id, id)).for("update");
    if (!creator) throw new Error("Создатель не найден.");
    if (!input.objectKey.startsWith(`avatars/creators/${id}/`)) throw new Error("Некорректный объект изображения.");
    await tx.update(creators).set({ ...emptyAvatar, avatarObjectKey: input.objectKey,
      avatarContentHash: input.contentHash, avatarSource: "manual", avatarVersion: creator.avatarVersion + 1, updatedAt: new Date(),
    }).where(eq(creators.id, id));
    return creator.avatarObjectKey;
  });
}

export async function clearCreatorAvatar(id: number) {
  return db.transaction(async tx => {
    const [creator] = await tx.select().from(creators).where(eq(creators.id, id)).for("update");
    if (!creator) throw new Error("Создатель не найден.");
    await tx.update(creators).set({ ...emptyAvatar, avatarVersion: creator.avatarVersion + 1, updatedAt: new Date() }).where(eq(creators.id, id));
    return creator.avatarObjectKey;
  });
}

export async function isAssignedCreatorAvatarObjectKey(key: string) {
  return Boolean((await db.select({ id: creators.id }).from(creators).where(eq(creators.avatarObjectKey, key)).limit(1))[0]);
}

export async function commitFantlabAvatar(input: {
  jobGuard?: SnapshotJobGuard;
  creatorId: number; expectedVersion: number; bindingId: number; externalCreatorId: string;
  objectKey: string; contentHash: string; originalUrl: string; sourceUrl: string;
}) {
  return withSnapshotJobGuard(input.jobGuard, async tx => {
    const [creator] = await tx.select().from(creators).where(eq(creators.id, input.creatorId)).for("update");
    if (!creator || creator.avatarSource === "manual" || creator.avatarVersion !== input.expectedVersion) return { committed: false as const };
    const bindings = await tx.select().from(providerCreatorBindings).where(and(
      eq(providerCreatorBindings.creatorId, input.creatorId), eq(providerCreatorBindings.provider, "fantlab"), eq(providerCreatorBindings.active, true),
    ));
    if (bindings.length !== 1 || bindings[0].id !== input.bindingId || bindings[0].externalCreatorId !== input.externalCreatorId) return { committed: false as const };
    const unresolved = await tx.select({ id: providerCreatorMappings.id }).from(providerCreatorMappings).where(and(
      eq(providerCreatorMappings.creatorId, input.creatorId), eq(providerCreatorMappings.provider, "fantlab"), isNull(providerCreatorMappings.bindingId),
    )).limit(1);
    if (unresolved.length) return { committed: false as const };
    await tx.update(creators).set({ avatarObjectKey: input.objectKey, avatarContentHash: input.contentHash,
      avatarSource: "fantlab", avatarSourceExternalId: input.externalCreatorId,
      avatarSourceUrl: input.sourceUrl, avatarOriginalUrl: input.originalUrl, avatarFetchedAt: new Date(),
      avatarVersion: creator.avatarVersion + 1, updatedAt: new Date(),
    }).where(eq(creators.id, creator.id));
    return { committed: true as const, previousObjectKey: creator.avatarObjectKey };
  });
}

/** Explicit administrator choice resolves conflicting IDs without changing entry links. */
export async function replaceCreatorFantlabBinding(input: { creatorId: number; externalCreatorId: string }) {
  if (!/^[1-9]\d*$/.test(input.externalCreatorId) || !Number.isSafeInteger(Number(input.externalCreatorId))) throw new Error("Некорректный FantLab ID.");
  return db.transaction(async tx => {
    const [owner] = await tx.select({ creator: creators, typeCode: creatorTypes.code }).from(creators)
      .innerJoin(creatorTypes, eq(creatorTypes.id, creators.typeId)).where(eq(creators.id, input.creatorId)).for("update", { of: creators });
    if (!owner || !["person", "collective"].includes(owner.typeCode)) throw new Error("FantLab ID автора доступен только людям и коллективам.");
    const creator = owner.creator;
    if (!creator) throw new Error("Создатель не найден.");
    await tx.insert(providerCreatorBindings).values({ provider: "fantlab", externalCreatorId: input.externalCreatorId, creatorId: input.creatorId }).onConflictDoNothing();
    const [binding] = await tx.select().from(providerCreatorBindings).where(and(eq(providerCreatorBindings.provider, "fantlab"), eq(providerCreatorBindings.active, true), eq(providerCreatorBindings.externalCreatorId, input.externalCreatorId)));
    if (!binding || binding.creatorId !== input.creatorId) throw new Error("Этот FantLab ID уже принадлежит другому создателю.");
    await tx.update(providerCreatorMappings).set({ bindingId: binding.id, updatedAt: new Date() }).where(and(eq(providerCreatorMappings.provider, "fantlab"), eq(providerCreatorMappings.creatorId, input.creatorId)));
    await tx.delete(providerCreatorBindings).where(and(eq(providerCreatorBindings.provider, "fantlab"), eq(providerCreatorBindings.active, true), eq(providerCreatorBindings.creatorId, input.creatorId), sql`${providerCreatorBindings.id} <> ${binding.id}`));
    await tx.update(creators).set({ avatarVersion: creator.avatarVersion + 1, updatedAt: new Date() }).where(eq(creators.id, creator.id));
    await enqueueCreatorImageFill(tx, creator.id);
    return binding;
  });
}

export async function getFantlabBindingOwner(externalCreatorId: string) {
  return (await db.select().from(providerCreatorBindings).where(and(eq(providerCreatorBindings.provider, "fantlab"), eq(providerCreatorBindings.active, true), eq(providerCreatorBindings.externalCreatorId, externalCreatorId))))[0] ?? null;
}

export async function getConflictingFantlabMappingOwners(creatorId: number, normalizedNames: string[]) {
  if (!normalizedNames.length) return [];
  return db.select({ creatorId: providerCreatorMappings.creatorId }).from(providerCreatorMappings).where(and(
    eq(providerCreatorMappings.provider, "fantlab"), sql`${providerCreatorMappings.creatorId} <> ${creatorId}`,
    inArray(providerCreatorMappings.normalizedExternalCreatorName, normalizedNames),
  ));
}
