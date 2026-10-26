import { isAniListCreatorId } from "@/lib/creators/anilist-identity";
import { and, asc, eq, inArray, or, sql } from "drizzle-orm";
import { creatorRequests, creatorRequestMediaItems, creatorRoles, creatorTypes, creators, entryCreators, entryCreatorSources, providerCreatorBindings, providerCreatorExclusions } from "@/db/schema";
import { normalizeSearchText } from "@/lib/search/normalize";
import { appendDomainEvent } from "@/lib/domain-events/persistence";
import { applyProviderCreatorName } from "./creator-name-import";
import { pruneEntryCreators, type CreatorTransaction } from "./creators";
import { createJobRun } from "./jobs";

type RoleCode = "production_company" | "network" | "director" | "creator" | "showrunner" | "producer";
export type TmdbRosterReference = { externalId: string; name: string; roleCode: RoleCode; sourcePosition: number };
const isPersonRole = (role: RoleCode) => role === "director" || role === "creator" || role === "showrunner";
/** Entry lock first, then every identity request in one stable order across all roles. */
export async function syncProviderCreatorRoster(tx: CreatorTransaction, mediaItemId: number, references: TmdbRosterReference[], options: { provider: "tmdb" | "anilist"; mediaType: "film" | "series" | "anime"; roleCodes: RoleCode[]; localizedNames?: boolean }) {
  const provider = options.provider;
  if (provider === "anilist" && references.some(ref => !isAniListCreatorId(ref.externalId) || (isPersonRole(ref.roleCode) !== ref.externalId.startsWith("person:")))) throw new Error("Некорректная идентичность создателя AniList.");
  const roleRows = await tx.select({id:creatorRoles.id,code:creatorRoles.code}).from(creatorRoles).where(inArray(creatorRoles.code, options.roleCodes));
  if (roleRows.length !== options.roleCodes.length) throw new Error("Роли провайдера не настроены.");
  const roles = new Map(roleRows.map(row=>[row.code,row.id]));
  const roleIds = roleRows.map(row=>row.id);
  const seen = new Set<string>();
  const unique = references.filter(ref => {
    const key = `${ref.externalId}:${ref.roleCode}`;
    if (seen.has(key)) return false;
    seen.add(key);
    return true;
  });
  const identities = [...new Map(unique.map(ref=>[ref.externalId,ref])).values()].sort((a,b)=>a.externalId.localeCompare(b.externalId));
  const old = await tx.select({externalId:creatorRequests.externalCreatorId}).from(creatorRequestMediaItems).innerJoin(creatorRequests,eq(creatorRequests.id,creatorRequestMediaItems.requestId))
    .where(and(eq(creatorRequestMediaItems.mediaItemId,mediaItemId),eq(creatorRequests.provider,provider),inArray(creatorRequestMediaItems.roleId,roleIds)));
  const ids = [...new Set([...identities.map(ref=>ref.externalId),...old.flatMap(row=>row.externalId ? [row.externalId] : [])])].sort();
  const detected = identities.length ? await tx.insert(creatorRequests).values(identities.map(ref=>({provider,mediaType:options.mediaType,externalCreatorId:ref.externalId,externalCreatorName:ref.name,normalizedExternalCreatorName:normalizeSearchText(ref.name)}))).onConflictDoNothing().returning({id:creatorRequests.id}) : [];
  const requestRows = ids.length ? await tx.select().from(creatorRequests).where(and(eq(creatorRequests.provider,provider),inArray(creatorRequests.externalCreatorId,ids))).orderBy(asc(creatorRequests.externalCreatorId)).for("update") : [];
  const requests = new Map(requestRows.map(row=>[row.externalCreatorId,row]));
  const currentIds = identities.map(ref=>ref.externalId);
  const names = [...new Set(identities.map(ref=>normalizeSearchText(ref.name)))];
  const bindings = currentIds.length ? await tx.select({binding:providerCreatorBindings,type:creatorTypes.code}).from(providerCreatorBindings)
    .innerJoin(creators,eq(creators.id,providerCreatorBindings.creatorId)).innerJoin(creatorTypes,eq(creatorTypes.id,creators.typeId))
    .where(and(eq(providerCreatorBindings.provider,provider),eq(providerCreatorBindings.active,true),inArray(providerCreatorBindings.externalCreatorId,currentIds))) : [];
  const exclusions = currentIds.length ? await tx.select().from(providerCreatorExclusions).where(and(eq(providerCreatorExclusions.provider,provider),or(
    inArray(providerCreatorExclusions.externalCreatorId,currentIds),
    and(sql`${providerCreatorExclusions.externalCreatorId} is null`,eq(providerCreatorExclusions.mediaType,options.mediaType),inArray(providerCreatorExclusions.normalizedExternalCreatorName,names)),
  ))) : [];
  await tx.delete(entryCreatorSources).where(and(eq(entryCreatorSources.entryId,mediaItemId),eq(entryCreatorSources.provider,provider),inArray(entryCreatorSources.roleId,roleIds)));
  if (requestRows.length) await tx.delete(creatorRequestMediaItems).where(and(eq(creatorRequestMediaItems.mediaItemId,mediaItemId),inArray(creatorRequestMediaItems.roleId,roleIds),inArray(creatorRequestMediaItems.requestId,requestRows.map(row=>row.id))));
  if (unique.length) await tx.insert(creatorRequestMediaItems).values(unique.map(ref=>({requestId:requests.get(ref.externalId)!.id,mediaItemId,roleId:roles.get(ref.roleCode)!,externalCreatorName:ref.name,sourcePosition:ref.sourcePosition}))).onConflictDoNothing();
  if (identities.length) await tx.update(creatorRequests).set({lastSeenAt:new Date(),updatedAt:new Date()}).where(inArray(creatorRequests.id,identities.map(ref=>requests.get(ref.externalId)!.id)));
  const allowed = unique.flatMap(ref=>{
    const request = requests.get(ref.externalId)!;
    const binding = bindings.find(row=>row.binding.externalCreatorId===ref.externalId && row.type===(isPersonRole(ref.roleCode) ? "person" : "organization"));
    const excluded = exclusions.some(row=>row.externalCreatorId===ref.externalId || (row.externalCreatorId===null && row.normalizedExternalCreatorName===normalizeSearchText(ref.name)));
    return binding && !excluded && request.decision!=="exclude" && !(request.manuallyReopened && request.decision===null) ? [{ref,binding:binding.binding}] : [];
  });
  // Localized people and image jobs touch the same owners; lock every type in one global order.
  const ownerIds = [...new Set(allowed.map(row => row.binding.creatorId))].sort((a,b) => a-b);
  if (ownerIds.length) await tx.select({id:creators.id}).from(creators).where(inArray(creators.id,ownerIds)).orderBy(asc(creators.id)).for("update");
  let createdLinks = 0;
  if (allowed.length) {
    const values = [...new Map(allowed.map(({ref,binding})=>[`${binding.creatorId}:${ref.roleCode}`,{entryId:mediaItemId,creatorId:binding.creatorId,roleId:roles.get(ref.roleCode)!}])).values()];
    const added = await tx.insert(entryCreators).values(values).onConflictDoNothing().returning({id:entryCreators.creatorId});
    createdLinks = added.length;
    await tx.insert(entryCreatorSources).values(allowed.map(({ref,binding})=>({entryId:mediaItemId,creatorId:binding.creatorId,roleId:roles.get(ref.roleCode)!,provider,bindingId:binding.id,normalizedExternalCreatorName:`${provider}:${ref.externalId}`,sourcePosition:ref.sourcePosition}))).onConflictDoNothing();
    if (options.localizedNames) for (const {ref,binding} of [...new Map(allowed.filter(({ref})=>isPersonRole(ref.roleCode)).map(row=>[row.binding.creatorId,row])).values()].sort((a,b)=>a.binding.creatorId-b.binding.creatorId)) await applyProviderCreatorName(tx,binding.creatorId,ref.name);
  }
  for (const ref of identities.filter(ref=>isPersonRole(ref.roleCode))) {
    const request = requests.get(ref.externalId)!;
    if (!detected.some(row=>row.id===request.id) || allowed.some(row=>row.ref.externalId===ref.externalId) || exclusions.some(row=>row.externalCreatorId===ref.externalId || (row.externalCreatorId===null && row.normalizedExternalCreatorName===normalizeSearchText(ref.name)))) continue;
    const event = await appendDomainEvent(tx,{type:"creator-request.created",actorAuthorId:null,aggregateType:"creator-request",aggregateId:String(request.id),payload:{requestId:request.id}});
    await createJobRun({type:"domain-events.dispatch",payload:{eventId:event.id},source:"event",maxAttempts:3,timeoutSeconds:300,retryBaseSeconds:60,retryMaxSeconds:3600},new Date(),tx);
  }
  await pruneEntryCreators(tx,mediaItemId);
  return {createdCreators:0,createdMappings:0,createdLinks};
}

export function syncTmdbCreatorRoster(tx: CreatorTransaction, mediaItemId: number, references: TmdbRosterReference[], options: { mediaType: "film" | "series"; roleCodes: RoleCode[]; localizedNames?: boolean }) {
  return syncProviderCreatorRoster(tx, mediaItemId, references, { ...options, provider: "tmdb" });
}
