import { enqueueCreatorAutoApproval } from "./creator-auto-approval-jobs";
import { applyProviderCreatorName, getImportedCreatorNameLocalization } from "./creator-name-import";
import { enqueueCreatorImageFill } from "./creator-image-jobs";
import { and, asc, eq, inArray, isNull, or, sql } from "drizzle-orm";
import { creatorRequests, creatorRequestMediaItems, creatorRoles, creators, creatorTypes, entryCreators, entryCreatorSources, providerCreatorBindings, providerCreatorExclusions, providerCreatorMappings } from "@/db/schema";
import { normalizeSearchText } from "@/lib/search/normalize";
import type { ProviderContributor } from "@/lib/providers/types";
import { appendDomainEvent } from "@/lib/domain-events/persistence";
import { createJobRun } from "./jobs";
import { pruneEntryCreators, type CreatorTransaction } from "./creators";

/** Caller owns the entry lock. Identity decisions never spill over to homonymous authors. */
export async function syncFantlabBookContributors(tx: CreatorTransaction, entryId: number, contributors: ProviderContributor[]) {
  const references = contributors.filter(value => value.roleCode === "writer").map(value => ({ ...value, normalizedName: normalizeSearchText(value.name) }));
  const identified = references.filter(value => value.externalId !== null);
  const ids = [...new Set(identified.map(value => value.externalId!))].sort();
  const names = [...new Set(references.map(value => value.normalizedName))].sort();
  const [role] = await tx.select().from(creatorRoles).where(eq(creatorRoles.code, "writer"));
  if (!role && references.length) throw new Error("Роль writer не настроена.");
  // Create every identity in stable order, including already confirmed bindings.
  // A name-only legacy decision remains an additional restriction, never an identity binding.
  const detectedIds = new Set<number>();
  for (const id of ids) {
    const reference = identified.find(value => value.externalId === id)!;
    const [created] = await tx.insert(creatorRequests).values({ provider: "fantlab", mediaType: "book", externalCreatorId: id, externalCreatorName: reference.name, normalizedExternalCreatorName: reference.normalizedName }).onConflictDoNothing().returning({ id: creatorRequests.id });
    if (created) detectedIds.add(created.id);
  }
  const decisions = ids.length || names.length ? await tx.select().from(creatorRequests).where(and(eq(creatorRequests.provider, "fantlab"), eq(creatorRequests.mediaType, "book"), or(ids.length ? inArray(creatorRequests.externalCreatorId, ids) : undefined, names.length ? and(isNull(creatorRequests.externalCreatorId), inArray(creatorRequests.normalizedExternalCreatorName, names)) : undefined))).orderBy(asc(creatorRequests.id)).for("update") : [];
  const exclusions = ids.length || names.length ? await tx.select().from(providerCreatorExclusions).where(and(eq(providerCreatorExclusions.provider, "fantlab"), eq(providerCreatorExclusions.mediaType, "book"), or(ids.length ? inArray(providerCreatorExclusions.externalCreatorId, ids) : undefined, names.length ? and(isNull(providerCreatorExclusions.externalCreatorId), inArray(providerCreatorExclusions.normalizedExternalCreatorName, names)) : undefined))) : [];
  const initialBindings = ids.length ? await tx.select().from(providerCreatorBindings).where(and(eq(providerCreatorBindings.provider, "fantlab"), eq(providerCreatorBindings.active, true), inArray(providerCreatorBindings.externalCreatorId, ids))) : [];
  const creatorIds = [...new Set(initialBindings.map(value => value.creatorId))].sort((a,b) => a-b);
  if (creatorIds.length) await tx.select({id:creators.id}).from(creators).where(inArray(creators.id, creatorIds)).orderBy(asc(creators.id)).for("update");
  const bindings = ids.length ? await tx.select().from(providerCreatorBindings).where(and(eq(providerCreatorBindings.provider, "fantlab"), eq(providerCreatorBindings.active, true), inArray(providerCreatorBindings.externalCreatorId, ids))) : [];
  const resolved = references.map(reference => {
    const request = decisions.find(value => value.externalCreatorId === reference.externalId && reference.externalId !== null);
    const legacy = decisions.find(value => value.externalCreatorId === null && value.normalizedExternalCreatorName === reference.normalizedName);
    const suppressedByName = Boolean(legacy && (legacy.decision === "exclude" || (legacy.decision === null && legacy.manuallyReopened))) || exclusions.some(value=>value.externalCreatorId===null && value.normalizedExternalCreatorName===reference.normalizedName);
    const suppressed = suppressedByName || Boolean(request && (request.decision === "exclude" || (request.decision === null && request.manuallyReopened))) || exclusions.some(value=>value.externalCreatorId!==null && value.externalCreatorId===reference.externalId);
    const binding = bindings.find(value => value.externalCreatorId === reference.externalId && creatorIds.includes(value.creatorId));
    return {reference, request, binding, suppressed, suppressedByName};
  });
  // Preserve historic provenance until every identity is known or explicitly suppressed.
  const complete = resolved.every(value => value.suppressed || value.binding);
  if (complete && role) await tx.delete(entryCreatorSources).where(and(eq(entryCreatorSources.entryId, entryId), eq(entryCreatorSources.provider, "fantlab"),eq(entryCreatorSources.roleId,role.id)));
  await tx.delete(creatorRequestMediaItems).where(and(eq(creatorRequestMediaItems.mediaItemId, entryId), sql`${creatorRequestMediaItems.requestId} in (select id from creator_requests where provider='fantlab' and external_creator_id is not null)`));
  let createdLinks = 0, createdMappings = 0;
  for (const {reference, request, binding, suppressed, suppressedByName} of resolved) {
    if (request) {
      await tx.insert(creatorRequestMediaItems).values({requestId:request.id,mediaItemId:entryId,roleId:role!.id,externalCreatorName:reference.name,sourcePosition:reference.position}).onConflictDoUpdate({target:[creatorRequestMediaItems.requestId,creatorRequestMediaItems.mediaItemId,creatorRequestMediaItems.roleId],set:{externalCreatorName:reference.name,sourcePosition:reference.position}});
      await tx.update(creatorRequests).set({lastSeenAt:new Date(),updatedAt:new Date()}).where(eq(creatorRequests.id,request.id));
    }
    if (suppressed) {
      // In incomplete bundles remove only this identity's provenance. Legacy name-only
      // exclusions deliberately continue to apply to that name, as before migration.
      await tx.delete(entryCreatorSources).where(and(eq(entryCreatorSources.entryId,entryId),eq(entryCreatorSources.provider,"fantlab"), or(binding ? eq(entryCreatorSources.bindingId,binding.id) : undefined,eq(entryCreatorSources.normalizedExternalCreatorName,`fantlab:${reference.externalId}`),suppressedByName ? eq(entryCreatorSources.normalizedExternalCreatorName,reference.normalizedName) : undefined)));
      continue;
    }
    if (!binding) {
      if (request && detectedIds.has(request.id)) {
        await enqueueCreatorAutoApproval(tx, [request.id]);
        const event=await appendDomainEvent(tx,{type:"creator-request.created",actorAuthorId:null,aggregateType:"creator-request",aggregateId:String(request.id),payload:{requestId:request.id}});
        await createJobRun({type:"domain-events.dispatch",payload:{eventId:event.id},source:"event",maxAttempts:3,timeoutSeconds:300,retryBaseSeconds:60,retryMaxSeconds:3600},new Date(),tx);
      }
      continue;
    }
    await applyProviderCreatorName(tx, binding.creatorId, reference.name);
    const [mapping]=await tx.insert(providerCreatorMappings).values({provider:"fantlab",mediaType:"book",externalCreatorName:reference.name,normalizedExternalCreatorName:reference.normalizedName,creatorId:binding.creatorId,bindingId:binding.id}).onConflictDoNothing().returning({id:providerCreatorMappings.id});
    if (mapping) createdMappings++;
    const [added]=await tx.insert(entryCreators).values({entryId,creatorId:binding.creatorId,roleId:role!.id}).onConflictDoNothing().returning();
    if (added) createdLinks++;
    await tx.insert(entryCreatorSources).values({entryId,creatorId:binding.creatorId,roleId:role!.id,provider:"fantlab",bindingId:binding.id,normalizedExternalCreatorName:`fantlab:${reference.externalId}`,sourcePosition:reference.position}).onConflictDoUpdate({target:[entryCreatorSources.entryId,entryCreatorSources.creatorId,entryCreatorSources.roleId,entryCreatorSources.provider,entryCreatorSources.normalizedExternalCreatorName],set:{sourcePosition:reference.position,bindingId:binding.id}});
    if (request && request.decision === null) await tx.update(creatorRequests).set({decision:"map",resolvedAt:new Date(),applyStatus:"processed",updatedAt:new Date()}).where(eq(creatorRequests.id,request.id));
  }
  await pruneEntryCreators(tx,entryId);
  const publishers = contributors.some(value=>value.roleCode === "publisher") ? await syncBookPublisherContributors(tx,entryId,"fantlab",contributors.filter(value=>value.roleCode === "publisher")) : {createdMappings:0,createdLinks:0};
  return {createdCreators:0,createdMappings:createdMappings+publishers.createdMappings,createdLinks:createdLinks+publishers.createdLinks};
}

/** Explicit moderation only; preserves alias rows and all manually owned links. */
export async function removeFantlabBookBinding(tx: CreatorTransaction, externalId: string) {
  const [binding]=await tx.select().from(providerCreatorBindings).where(and(eq(providerCreatorBindings.provider,"fantlab"),eq(providerCreatorBindings.externalCreatorId,externalId),eq(providerCreatorBindings.active,true)));
  if (!binding) return;
  await tx.select({id:creators.id}).from(creators).where(eq(creators.id,binding.creatorId)).for("update");
  await tx.delete(entryCreatorSources).where(eq(entryCreatorSources.bindingId,binding.id));
  await tx.delete(entryCreators).where(and(eq(entryCreators.creatorId,binding.creatorId),eq(entryCreators.isManual,false),sql`not exists(select 1 from entry_creator_sources s where s.entry_id=${entryCreators.entryId} and s.creator_id=${entryCreators.creatorId} and s.role_id=${entryCreators.roleId})`));
  await tx.update(providerCreatorBindings).set({active:false,updatedAt:new Date()}).where(eq(providerCreatorBindings.id,binding.id));
  await tx.update(creators).set({avatarVersion:sql`${creators.avatarVersion}+1`,updatedAt:new Date()}).where(eq(creators.id,binding.creatorId));
}

export async function resolveFantlabBookRequest(tx: CreatorTransaction, request: typeof creatorRequests.$inferSelect, input:{decision:"create"|"map"|"exclude";creatorId?:number;name?:string}) {
  const externalId=request.externalCreatorId!;
  if (input.decision === "exclude") {
    await removeFantlabBookBinding(tx,externalId);
    await tx.insert(providerCreatorExclusions).values({provider:"fantlab",mediaType:"book",externalCreatorId:externalId,externalCreatorName:request.externalCreatorName,normalizedExternalCreatorName:request.normalizedExternalCreatorName}).onConflictDoNothing();
    return;
  }
  let creatorId=input.creatorId;
  if (input.decision === "create") {
    if (!input.name?.trim()) throw new Error("Укажите имя автора.");
    const [type]=await tx.select().from(creatorTypes).where(eq(creatorTypes.code,"person"));
    if (!type) throw new Error("Тип person не настроен.");
    const [next]=await tx.execute<{id:number}>(sql`select nextval(pg_get_serial_sequence('creators','id'))::int id`);
    const [created]=await tx.insert(creators).values({id:next.id,name:input.name.trim(),...getImportedCreatorNameLocalization({name:input.name}),slug:`creator-${next.id}`,typeId:type.id}).returning({id:creators.id});
    creatorId=created.id;
    await enqueueCreatorImageFill(tx, created.id);
  }
  const [creator]=creatorId ? await tx.select({id:creators.id,type:creatorTypes.code}).from(creators).innerJoin(creatorTypes,eq(creatorTypes.id,creators.typeId)).where(eq(creators.id,creatorId)).for("update",{of:creators}) : [];
  if (!creator || creator.type !== "person") throw new Error("Выберите автора типа person.");
  await tx.insert(providerCreatorBindings).values({provider:"fantlab",externalCreatorId:externalId,creatorId:creator.id,externalCreatorName:request.externalCreatorName}).onConflictDoNothing();
  const [binding]=await tx.select().from(providerCreatorBindings).where(and(eq(providerCreatorBindings.provider,"fantlab"),eq(providerCreatorBindings.externalCreatorId,externalId),eq(providerCreatorBindings.active,true)));
  if (!binding || binding.creatorId !== creator.id) throw new Error("Этот FantLab ID уже принадлежит другому создателю.");
  await enqueueCreatorImageFill(tx, creator.id);
  await tx.update(creators).set({avatarVersion:sql`${creators.avatarVersion}+1`,updatedAt:new Date()}).where(eq(creators.id,creator.id));
  await tx.delete(providerCreatorExclusions).where(and(eq(providerCreatorExclusions.provider,"fantlab"),eq(providerCreatorExclusions.externalCreatorId,externalId)));
}

/** Historical publisher names use ordinary name moderation, never implicit person creation. */
export async function syncBookPublisherContributors(tx:CreatorTransaction,entryId:number,provider:string,contributors:ProviderContributor[]) {
  const [role]=await tx.select().from(creatorRoles).where(eq(creatorRoles.code,"publisher"));
  if (!role) {if (contributors.length) throw new Error("Роль publisher не настроена."); return {createdMappings:0,createdLinks:0};}
  const references=[...new Map(contributors.map(value=>[normalizeSearchText(value.name),value])).entries()].sort(([a],[b])=>a.localeCompare(b));
  await tx.delete(entryCreatorSources).where(and(eq(entryCreatorSources.entryId,entryId),eq(entryCreatorSources.provider,provider),eq(entryCreatorSources.roleId,role.id)));
  await tx.delete(creatorRequestMediaItems).where(and(eq(creatorRequestMediaItems.mediaItemId,entryId),eq(creatorRequestMediaItems.roleId,role.id),sql`${creatorRequestMediaItems.requestId} in (select id from creator_requests where provider=${provider})`));
  let createdLinks=0;
  for (const [normalizedName,reference] of references) {
    const [detected]=await tx.insert(creatorRequests).values({provider,mediaType:"book",externalCreatorName:reference.name,normalizedExternalCreatorName:normalizedName}).onConflictDoNothing().returning();
    const [request]=await tx.select().from(creatorRequests).where(and(eq(creatorRequests.provider,provider),eq(creatorRequests.mediaType,"book"),isNull(creatorRequests.externalCreatorId),eq(creatorRequests.normalizedExternalCreatorName,normalizedName))).for("update");
    await tx.insert(creatorRequestMediaItems).values({requestId:request.id,mediaItemId:entryId,roleId:role.id,externalCreatorName:reference.name,sourcePosition:reference.position}).onConflictDoNothing();
    const [excluded]=await tx.select().from(providerCreatorExclusions).where(and(eq(providerCreatorExclusions.provider,provider),eq(providerCreatorExclusions.mediaType,"book"),isNull(providerCreatorExclusions.externalCreatorId),eq(providerCreatorExclusions.normalizedExternalCreatorName,normalizedName)));
    const [mapping]=await tx.select().from(providerCreatorMappings).where(and(eq(providerCreatorMappings.provider,provider),eq(providerCreatorMappings.mediaType,"book"),eq(providerCreatorMappings.normalizedExternalCreatorName,normalizedName)));
    if (mapping && !excluded && request.decision !== "exclude" && !(request.decision===null && request.manuallyReopened)) {
      const [added]=await tx.insert(entryCreators).values({entryId,creatorId:mapping.creatorId,roleId:role.id}).onConflictDoNothing().returning();
      if(added) createdLinks++;
      await tx.insert(entryCreatorSources).values({entryId,creatorId:mapping.creatorId,roleId:role.id,provider,normalizedExternalCreatorName:normalizedName,sourcePosition:reference.position}).onConflictDoNothing();
    }
    if (detected && !mapping && !excluded) await enqueueCreatorAutoApproval(tx, [request.id]);
    if(detected) {
      const event=await appendDomainEvent(tx,{type:"creator-request.created",actorAuthorId:null,aggregateType:"creator-request",aggregateId:String(request.id),payload:{requestId:request.id}});
      await createJobRun({type:"domain-events.dispatch",payload:{eventId:event.id},source:"event",maxAttempts:3,timeoutSeconds:300,retryBaseSeconds:60,retryMaxSeconds:3600},new Date(),tx);
    }
  }
  await pruneEntryCreators(tx,entryId);
  return {createdMappings:0,createdLinks};
}
