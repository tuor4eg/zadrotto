import { and, asc, eq, exists, gt, isNull, lte, or, sql } from "drizzle-orm";
import { db } from "@/db";
import { creators, creatorRoles, creatorTypes, providerCreatorBindings } from "@/db/schema";
import { CREATOR_IMAGE_KINDS, type CreatorImagesPayload } from "@/lib/creators/image-policy";

function eligibility(input: Pick<CreatorImagesPayload, "creatorTypeId" | "roleId">, range?: { afterId: number; throughId: number }) {
  return and(isNull(creators.avatarObjectKey), isNull(creators.avatarSource),
    input.creatorTypeId ? eq(creators.typeId, input.creatorTypeId) : undefined,
    input.roleId ? sql`exists (select 1 from entry_creators ec where ec.creator_id=${creators.id} and ec.role_id=${input.roleId})` : undefined,
    exists(db.select({ id: providerCreatorBindings.id }).from(providerCreatorBindings).where(and(
      eq(providerCreatorBindings.creatorId, creators.id), eq(providerCreatorBindings.active, true),
      range ? gt(providerCreatorBindings.creatorId, range.afterId) : undefined,
      range ? lte(providerCreatorBindings.creatorId, range.throughId) : undefined,
      or(...CREATOR_IMAGE_KINDS.map(kind => and(eq(creatorTypes.code, kind.type), eq(providerCreatorBindings.provider, kind.provider), sql`${providerCreatorBindings.externalCreatorId} ~ ${kind.prefix ? `^${kind.prefix}[1-9][0-9]*$` : '^[1-9][0-9]*$'}`)),
        and(eq(creatorTypes.code, "organization"), eq(providerCreatorBindings.provider, "anilist"), sql`${providerCreatorBindings.externalCreatorId} ~ '^studio:[1-9][0-9]*$'`)),
    ))));
}
export function creatorImagesScopeQuery(input: CreatorImagesPayload) {
  return db.select({ throughId: sql<number>`coalesce(max(${creators.id}),0)::int`, total: sql<number>`count(*)::int` }).from(creators)
    .innerJoin(creatorTypes, eq(creatorTypes.id, creators.typeId)).where(eligibility(input));
}
export function creatorImagesBatchQuery(input: CreatorImagesPayload & { afterId: number; throughId: number }) {
  return db.select({ id: creators.id }).from(creators).innerJoin(creatorTypes, eq(creatorTypes.id, creators.typeId))
    .where(and(eligibility(input, input), gt(creators.id, input.afterId), lte(creators.id, input.throughId)))
    .orderBy(asc(creators.id)).limit(input.batchSize + 1);
}
export async function validateCreatorImageFilters(input: CreatorImagesPayload) {
  const [type, role] = await Promise.all([
    input.creatorTypeId ? db.select({ id: creatorTypes.id }).from(creatorTypes).where(eq(creatorTypes.id, input.creatorTypeId)) : Promise.resolve([{}]),
    input.roleId ? db.select({ id: creatorRoles.id }).from(creatorRoles).where(eq(creatorRoles.id, input.roleId)) : Promise.resolve([{}]),
  ]);
  if (!type.length || !role.length) throw new Error("INVALID_CREATOR_IMAGE_FILTER");
}
