import { createHash } from "node:crypto";
import { and, asc, desc, eq, inArray, ne, sql } from "drizzle-orm";
import { db } from "@/db";
import { adminActivityLogs, jobRuns, platforms, platformRequests, platformProviderProfiles, providerPlatformMappings } from "@/db/schema";
import { normalizeSearchText } from "@/lib/search/normalize";
import type { PlatformAssetCounters, PlatformAssetProposal, PlatformLogoCandidate } from "@/lib/platforms/contracts";

export class PlatformAssetConflict extends Error {}
type Tx = Parameters<Parameters<typeof db.transaction>[0]>[0];
type Request = typeof platformRequests.$inferSelect;
const counters = (): PlatformAssetCounters => ({created:0,approved:0,applying:0,pending:0,applied:0,skipped:0});
const fingerprint = (value: unknown) => createHash("sha256").update(JSON.stringify(value)).digest("hex");

async function enqueue(tx: Tx, requestId: number, adminId: number) {
  const now = new Date();
  const [run] = await tx.insert(jobRuns).values({type:"media.platform-request-apply",payload:{requestId},source:"manual",
    createdByAdminId:adminId,scheduledFor:now,availableAt:now,maxAttempts:3,timeoutSeconds:300,retryBaseSeconds:60,retryMaxSeconds:3600}).returning({id:jobRuns.id});
  await tx.update(platformRequests).set({jobRunId:run.id,applyStatus:"applying",jobError:null,updatedAt:now}).where(eq(platformRequests.id,requestId));
  return {requestId,jobRunId:run.id};
}

/** Complete only existing bindings. Ambiguity is a sync diagnostic, not an editorial request. */
export async function resolveMissingPlatformProviderIds(platformId:number,lease?:{runId:number;lockToken:string}) {
  return db.transaction(async tx=>{
    const result={resolved:0,missing:0,ambiguous:0};
    if(lease) {
      const [run]=await tx.select({id:jobRuns.id}).from(jobRuns).where(and(eq(jobRuns.id,lease.runId),eq(jobRuns.lockToken,lease.lockToken),
        eq(jobRuns.status,"running"),sql`${jobRuns.lockExpiresAt}>now()`)).for("update");
      if(!run)throw new PlatformAssetConflict("Запуск задачи больше не владеет lease.");
    }
    await tx.select({id:providerPlatformMappings.id}).from(providerPlatformMappings)
      .where(eq(providerPlatformMappings.platformId,platformId)).orderBy(asc(providerPlatformMappings.id)).for("update");
    const [counts]=await tx.execute<{resolved:number;missing:number;ambiguous:number}>(sql`
      with matches as materialized (
        select m.id,min(p.external_id) external_id,count(p.external_id)::int matches
        from provider_platform_mappings m left join platform_provider_profiles p
          on p.provider=m.provider and p.normalized_name=m.normalized_external_platform_name and p.is_available
        where m.platform_id=${platformId} and m.external_platform_id is null and m.provider in ('igdb','rawg')
        group by m.id
      ), changed as (
        update provider_platform_mappings m set external_platform_id=matches.external_id,updated_at=now()
        from matches where matches.id=m.id and matches.matches=1 and m.external_platform_id is null returning m.id
      )
      select (select count(*)::int from changed) resolved,
        count(*) filter(where matches=0)::int missing,count(*) filter(where matches>1)::int ambiguous from matches
    `);
    Object.assign(result,counts);
    return result;
  });
}

/** A candidate represents an actual saved image, deduplicated across provider aliases by content. */
async function logoCandidates(connection:Tx|typeof db,platformId:number):Promise<PlatformLogoCandidate[]> {
  const rows=await connection.selectDistinct({provider:platformProviderProfiles.provider,externalId:platformProviderProfiles.externalId,
    name:platformProviderProfiles.name,imageKey:platformProviderProfiles.imageKey,objectKey:platformProviderProfiles.imageObjectKey,
    contentHash:platformProviderProfiles.imageContentHash,imageId:platformProviderProfiles.imageId,imageUrl:platformProviderProfiles.imageUrl})
    .from(providerPlatformMappings).innerJoin(platformProviderProfiles,and(eq(platformProviderProfiles.provider,providerPlatformMappings.provider),
      eq(platformProviderProfiles.externalId,providerPlatformMappings.externalPlatformId)))
    .where(and(eq(providerPlatformMappings.platformId,platformId),eq(platformProviderProfiles.isAvailable,true)));
  // Prefer IGDB provenance for identical files, never choose between distinct images by ID.
  rows.sort((a,b)=>(a.provider==="igdb"?0:1)-(b.provider==="igdb"?0:1)||a.externalId.localeCompare(b.externalId));
  const images=new Map<string,PlatformLogoCandidate>();
  for(const row of rows) {
    if(!row.contentHash||!row.objectKey||!row.imageKey||row.imageKey!==(row.provider==="igdb"?row.imageId:row.imageUrl))continue;
    if(!images.has(row.contentHash))images.set(row.contentHash,{key:row.contentHash,provider:row.provider,externalId:row.externalId,
      name:row.name,imageKey:row.imageKey,objectKey:row.objectKey,contentHash:row.contentHash});
  }
  return [...images.values()].sort((a,b)=>(a.provider==="igdb"?0:1)-(b.provider==="igdb"?0:1)||a.name.localeCompare(b.name)||a.key.localeCompare(b.key));
}
async function needsManualChoice(connection:Tx|typeof db,platformId:number,mode:string) {
  if(mode==="combined")return true;
  // Distinct names for the same provider ID are aliases; distinct IDs represent source platforms.
  const [multiple]=await connection.select({provider:providerPlatformMappings.provider}).from(providerPlatformMappings)
    .where(and(eq(providerPlatformMappings.platformId,platformId),sql`${providerPlatformMappings.externalPlatformId} is not null`))
    .groupBy(providerPlatformMappings.provider).having(sql`count(distinct ${providerPlatformMappings.externalPlatformId})>1`).limit(1);
  return Boolean(multiple);
}
async function hasUncachedLogo(connection:Tx|typeof db,platformId:number) {
  const [row]=await connection.select({id:providerPlatformMappings.id}).from(providerPlatformMappings)
    .innerJoin(platformProviderProfiles,and(eq(platformProviderProfiles.provider,providerPlatformMappings.provider),eq(platformProviderProfiles.externalId,providerPlatformMappings.externalPlatformId)))
    .where(and(eq(providerPlatformMappings.platformId,platformId),eq(platformProviderProfiles.isAvailable,true),
      sql`${platformProviderProfiles.imageUrl} is not null and (
        ${platformProviderProfiles.imageObjectKey} is null or ${platformProviderProfiles.imageContentHash} is null or
        ${platformProviderProfiles.imageKey} is distinct from case when ${platformProviderProfiles.provider}='igdb' then ${platformProviderProfiles.imageId} else ${platformProviderProfiles.imageUrl} end)`)).limit(1);
  return Boolean(row);
}
const candidateSet=(candidates:PlatformLogoCandidate[])=>candidates.map(row=>row.key).sort();
const selectCandidate=(proposal:PlatformAssetProposal,candidate:PlatformLogoCandidate):PlatformAssetProposal=>({
  ...proposal,selectedCandidateKey:candidate.key,provider:candidate.provider,externalId:candidate.externalId,
  imageKey:candidate.imageKey,objectKey:candidate.objectKey,contentHash:candidate.contentHash,
});

export async function proposePlatformLogoRequests(platformId:number,adminId:number) {
  return db.transaction(async tx=>{
    const result=counters();
    const [platform]=await tx.select().from(platforms).where(eq(platforms.id,platformId)).for("update");
    if(!platform){result.skipped++;return result;}
    if(await hasUncachedLogo(tx,platformId)){result.skipped++;return result;}
    const candidates=await logoCandidates(tx,platformId);
    if(!candidates.length){
      await tx.update(platformRequests).set({superseded:true,updatedAt:new Date()}).where(and(eq(platformRequests.kind,"logo"),eq(platformRequests.targetPlatformId,platformId)));
      result.skipped++;return result;
    }
    const key=fingerprint([platformId,candidateSet(candidates)]);
    await tx.update(platformRequests).set({superseded:true,updatedAt:new Date()}).where(and(eq(platformRequests.kind,"logo"),
      eq(platformRequests.targetPlatformId,platformId),ne(platformRequests.proposalKey,key),eq(platformRequests.superseded,false)));
    const proposal:PlatformAssetProposal={platformId,expectedVersion:platform.logoVersion,candidates,
      reason:await needsManualChoice(tx,platformId,platform.logoMode)?"combined":candidates.length>1?"choose-image":candidates[0].provider==="igdb"?"unique-logo":"rawg-review"};
    const [created]=await tx.insert(platformRequests).values({kind:"logo",provider:"platform-logos",mediaType:"game",
      externalPlatformName:platform.name,normalizedExternalPlatformName:normalizeSearchText(platform.name),
      targetPlatformId:platformId,proposalKey:key,proposal}).onConflictDoNothing().returning({id:platformRequests.id});
    if(created){result.created++;return result;}
    const [existing]=await tx.select().from(platformRequests).where(and(eq(platformRequests.kind,"logo"),eq(platformRequests.proposalKey,key))).for("update");
    if(existing?.decision===null&&existing.applyStatus==="pending")await tx.update(platformRequests)
      .set({proposal,updatedAt:new Date()}).where(eq(platformRequests.id,existing.id));
    if(existing?.superseded)await tx.update(platformRequests).set({superseded:false,updatedAt:new Date()}).where(eq(platformRequests.id,existing.id));
    if(existing?.decision==="map"&&existing.applyStatus==="processed"&&existing.proposal?.selectedCandidateKey) {
      const selected=candidates.find(row=>row.key===existing.proposal!.selectedCandidateKey);
      if(selected&&(platform.importedLogoObjectKey!==selected.objectKey||platform.importedLogoProvider!==selected.provider||platform.importedLogoExternalId!==selected.externalId)) {
        // Reuse an existing approval of the very same image after a provider alias changes.
        await tx.update(platformRequests).set({proposal:selectCandidate({...proposal},selected),updatedAt:new Date()}).where(eq(platformRequests.id,existing.id));
        await enqueue(tx,existing.id,adminId);result.applying++;
      }
    }
    return result;
  });
}

async function validatedChoice(tx:Tx,request:Request,proposal:PlatformAssetProposal,automatic:boolean) {
  const [platform]=await tx.select().from(platforms).where(eq(platforms.id,proposal.platformId)).for("update");
  if(!platform||request.targetPlatformId!==platform.id)throw new PlatformAssetConflict("Платформа изменилась.");
  if(platform.logoVersion!==proposal.expectedVersion)throw new PlatformAssetConflict("Изображение платформы изменилось. Обновите страницу.");
  if(await hasUncachedLogo(tx,platform.id))throw new PlatformAssetConflict("Не все изображения платформы сохранены. Повторите синхронизацию.");
  const candidates=await logoCandidates(tx,platform.id);
  if(fingerprint(candidateSet(candidates))!==fingerprint(candidateSet(proposal.candidates)))throw new PlatformAssetConflict("Набор изображений изменился. Повторите синхронизацию.");
  const candidate=candidates.find(row=>row.key===proposal.selectedCandidateKey);
  if(!candidate)throw new PlatformAssetConflict("Выберите доступное изображение.");
  if(automatic&&(await needsManualChoice(tx,platform.id,platform.logoMode)||candidates.length!==1||candidate.provider!=="igdb"))throw new PlatformAssetConflict("Нужен ручной выбор изображения.");
  return {platform,candidate};
}

export async function resolvePlatformAssetRequest(input:{requestId:number;adminId:number;decision:"map"|"exclude";candidateKey?:string;autoApprove?:boolean}) {
  const [initial]=await db.select().from(platformRequests).where(eq(platformRequests.id,input.requestId));
  if(!initial?.proposal||initial.kind!=="logo")throw new PlatformAssetConflict("Заявка не найдена.");
  return db.transaction(async tx=>{
    const [platform]=await tx.select().from(platforms).where(eq(platforms.id,initial.proposal!.platformId)).for("update");
    const [request]=await tx.select().from(platformRequests).where(eq(platformRequests.id,input.requestId)).for("update");
    if(!platform||!request?.proposal||request.superseded||request.decision!==null||request.applyStatus!=="pending")throw new PlatformAssetConflict("Решение уже принято или применяется.");
    if(input.autoApprove&&request.autoApprovalBlocked)throw new PlatformAssetConflict("Автоапрув отключён после ручного решения.");
    let proposal={...request.proposal};
    if(input.decision==="exclude")proposal.expectedVersion=platform.logoVersion;
    if(input.decision==="map") {
      proposal.selectedCandidateKey=input.candidateKey;
      if(!input.autoApprove)proposal.expectedVersion=platform.logoVersion;
      const {candidate}=await validatedChoice(tx,request,proposal,Boolean(input.autoApprove));
      proposal=selectCandidate(proposal,candidate);
    }
    const now=new Date();
    await tx.update(platformRequests).set({proposal,decision:input.decision,resolvedAt:now,resolvedByAdminId:input.adminId,
      autoApproved:Boolean(input.autoApprove),autoApprovalBlocked:request.autoApprovalBlocked||input.decision==="exclude",applyStatus:"applying",updatedAt:now}).where(eq(platformRequests.id,request.id));
    const queued=await enqueue(tx,request.id,input.adminId);
    await tx.insert(adminActivityLogs).values({action:"platform-request.resolved",actorType:input.autoApprove?"system":"admin",adminUserId:input.adminId,
      entityType:"platform-request",entityId:request.id,entityLabel:request.externalPlatformName,status:"success",severity:"info",
      message:input.autoApprove?"Логотип платформы подтверждён автоматически.":"Принято решение по логотипу платформы.",
      metadata:{kind:"logo",automatic:Boolean(input.autoApprove),decision:input.decision,jobRunId:queued.jobRunId}});
    return queued;
  });
}

export async function autoApprovePlatformAssetRequests(platformId:number,adminId:number) {
  const result=counters();
  const rows=await db.select().from(platformRequests).where(and(eq(platformRequests.targetPlatformId,platformId),eq(platformRequests.kind,"logo"),eq(platformRequests.superseded,false))).orderBy(asc(platformRequests.id));
  const ids=rows.flatMap(row=>row.jobRunId?[row.jobRunId]:[]);
  const runs=ids.length?await db.select({id:jobRuns.id,status:jobRuns.status}).from(jobRuns).where(inArray(jobRuns.id,ids)):[];
  const statuses=new Map(runs.map(row=>[row.id,row.status]));
  for(const row of rows) {
    if(row.applyStatus==="applying"){
      const status=row.jobRunId?statuses.get(row.jobRunId):undefined;
      if(!status||["queued","running"].includes(status))result.applying++;else result.pending++;continue;
    }
    if(row.decision!==null){if(row.applyStatus==="processed")result.applied++;continue;}
    if(row.autoApprovalBlocked||row.proposal?.reason!=="unique-logo"){result.pending++;continue;}
    try {await resolvePlatformAssetRequest({requestId:row.id,adminId,decision:"map",candidateKey:row.proposal.candidates[0]?.key,autoApprove:true});result.approved++;result.applying++;}
    catch(error){if(!(error instanceof PlatformAssetConflict))throw error;result.pending++;}
  }
  return result;
}

export async function applyPlatformAssetRequest(requestId:number,input:{jobRunId?:number;signal?:AbortSignal}={}) {
  const [initial]=await db.select().from(platformRequests).where(eq(platformRequests.id,requestId));
  if(!initial?.proposal)throw new PlatformAssetConflict("Заявка не найдена.");
  try {
    return await db.transaction(async tx=>{
      input.signal?.throwIfAborted();
      await tx.select({id:platforms.id}).from(platforms).where(eq(platforms.id,initial.proposal!.platformId)).for("update");
      const [request]=await tx.select().from(platformRequests).where(eq(platformRequests.id,requestId)).for("update");
      if(!request?.proposal||(input.jobRunId&&request.jobRunId!==input.jobRunId)||request.applyStatus==="processed")return {processed:0};
      if(request.superseded) {
        await tx.update(platformRequests).set({applyStatus:request.decision===null?"pending":"processed",updatedAt:new Date()}).where(eq(platformRequests.id,requestId));
        return {processed:0};
      }
      const p=request.proposal;
      if(request.decision==="map") {
        const {platform,candidate}=await validatedChoice(tx,request,p,request.autoApproved);
        await tx.update(platforms).set({importedLogoObjectKey:candidate.objectKey,importedLogoContentHash:candidate.contentHash,
          importedLogoProvider:candidate.provider,importedLogoExternalId:candidate.externalId,importedLogoImageKey:candidate.imageKey,
          logoVersion:platform.logoVersion+1,updatedAt:new Date()}).where(eq(platforms.id,platform.id));
        await tx.update(platformRequests).set({proposal:selectCandidate(p,candidate)}).where(eq(platformRequests.id,requestId));
      } else if(request.decision==="exclude") {
        const [platform]=await tx.select().from(platforms).where(eq(platforms.id,p.platformId));
        if(!platform||platform.logoVersion!==p.expectedVersion)throw new PlatformAssetConflict("Изображение платформы изменилось. Повторите решение.");
        await tx.update(platforms).set({importedLogoObjectKey:null,importedLogoContentHash:null,importedLogoProvider:null,
          importedLogoExternalId:null,importedLogoImageKey:null,logoVersion:platform.logoVersion+1,updatedAt:new Date()}).where(eq(platforms.id,p.platformId));
      } else if(request.decision===null) {
        await tx.update(platforms).set({logoVersion:sql`${platforms.logoVersion}+1`,importedLogoObjectKey:null,importedLogoContentHash:null,
          importedLogoProvider:null,importedLogoExternalId:null,importedLogoImageKey:null,updatedAt:new Date()}).where(and(eq(platforms.id,p.platformId),
            eq(platforms.importedLogoProvider,p.provider??""),eq(platforms.importedLogoExternalId,p.externalId??""),eq(platforms.importedLogoImageKey,p.imageKey??"")));
      }
      await tx.update(platformRequests).set({applyStatus:request.decision===null?"pending":"processed",jobError:null,updatedAt:new Date()}).where(eq(platformRequests.id,requestId));
      return {processed:1};
    });
  } catch(error) {
    await db.update(platformRequests).set({applyStatus:"failed",jobError:error instanceof Error?error.message:"Не удалось применить решение.",updatedAt:new Date()})
      .where(and(eq(platformRequests.id,requestId),input.jobRunId?eq(platformRequests.jobRunId,input.jobRunId):undefined));
    throw error;
  }
}

export async function reopenPlatformAssetRequest(input:{requestId:number;adminId:number}) {
  const [initial]=await db.select().from(platformRequests).where(eq(platformRequests.id,input.requestId));
  if(!initial?.proposal)throw new PlatformAssetConflict("Заявка не найдена.");
  return db.transaction(async tx=>{
    await tx.select({id:platforms.id}).from(platforms).where(eq(platforms.id,initial.proposal!.platformId)).for("update");
    const [r]=await tx.select().from(platformRequests).where(eq(platformRequests.id,input.requestId)).for("update");
    if(!r||r.kind!=="logo"||r.applyStatus==="applying")throw new PlatformAssetConflict("Дождитесь завершения применения.");
    await tx.update(platformRequests).set({decision:null,resolvedAt:null,resolvedByAdminId:null,autoApproved:false,autoApprovalBlocked:true,applyStatus:"applying",updatedAt:new Date()}).where(eq(platformRequests.id,r.id));
    return enqueue(tx,r.id,input.adminId);
  });
}

export async function getPlatformAssetRequestChoices(requestId:number) {
  const [request]=await db.select().from(platformRequests).where(eq(platformRequests.id,requestId));
  if(!request||request.kind!=="logo")return null;
  const [platform]=await db.select().from(platforms).where(eq(platforms.id,request.targetPlatformId??0));
  const [run]=request.jobRunId?await db.select({status:jobRuns.status,error:jobRuns.errorMessage}).from(jobRuns).where(eq(jobRuns.id,request.jobRunId)):[];
  const status=run&&["failed","cancelled"].includes(run.status)?"failed" as const:request.applyStatus;
  return {request:{...request,applyStatus:status,jobError:run?.error??request.jobError},platform};
}

export async function getPlatformAssetEditorState(platformId:number) {
  const requests=await db.select({id:platformRequests.id,kind:platformRequests.kind,name:platformRequests.externalPlatformName,
    superseded:platformRequests.superseded,decision:platformRequests.decision,status:platformRequests.applyStatus,reason:platformRequests.proposal})
    .from(platformRequests).where(and(eq(platformRequests.targetPlatformId,platformId),ne(platformRequests.kind,"mapping")))
    .orderBy(desc(platformRequests.id)).limit(50);
  return {requests};
}
