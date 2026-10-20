import { guardSnapshotJob, withSnapshotJobGuard } from "./provider-snapshots";
import { and, asc, desc, eq, inArray, isNull, lt, or, sql } from 'drizzle-orm';
import { db } from '@/db';
import { jobRuns, platforms, platformProviderProfiles, providerPlatformMappings } from '@/db/schema';
import type { ProviderPlatformProfile } from '@/lib/platforms/provider-api';
import { type PlatformLogoSyncPayload } from '@/lib/platforms/logo-sync-model';
import { JobError } from '@/lib/jobs/types';

type Transaction = Parameters<Parameters<typeof db.transaction>[0]>[0];
export type PlatformLogoJobLease = { runId:number;lockToken:string };
async function lockLease(tx:Transaction,lease:PlatformLogoJobLease) {
  await guardSnapshotJob(tx, lease);
  const [run]=await tx.select({id:jobRuns.id,adminId:jobRuns.createdByAdminId}).from(jobRuns).where(eq(jobRuns.id,lease.runId));
  if (!run) throw new JobError('lease-lost','Запуск задачи уже передан другому worker.',{retryable:false});
  return run;
}
export async function assertPlatformLogoJobLease(lease:PlatformLogoJobLease) {
  return withSnapshotJobGuard(lease, tx=>lockLease(tx,lease));
}
export async function checkpointPlatformLogoJob(lease:PlatformLogoJobLease,payload:PlatformLogoSyncPayload,mutate?:(tx:Transaction)=>Promise<void>) {
  await withSnapshotJobGuard(lease, async tx=>{
    if (mutate) await mutate(tx);
    await tx.update(jobRuns).set({payload,updatedAt:new Date()}).where(eq(jobRuns.id,lease.runId));
  });
}
export async function savePlatformCataloguePage(lease:PlatformLogoJobLease,payload:PlatformLogoSyncPayload,profiles:ProviderPlatformProfile[],completedProvider?:'igdb'|'rawg') {
  const provider=completedProvider??payload.checkpoint?.currentProvider;
  const directory=provider?payload.checkpoint?.directory[provider]:undefined;
  const relevant=directory?profiles.filter(profile=>directory.names.includes(profile.normalizedName)||directory.knownIds.includes(profile.externalId)):profiles;
  await checkpointPlatformLogoJob(lease,payload,async tx=>{
    for(const profile of relevant)await upsertProfile(tx,profile);
    if(completedProvider&&directory&&directory.names.length) {
      await tx.update(platformProviderProfiles).set({isAvailable:false,updatedAt:new Date()}).where(and(
        eq(platformProviderProfiles.provider,completedProvider),inArray(platformProviderProfiles.normalizedName,directory.names),
        or(isNull(platformProviderProfiles.profileFetchedAt),lt(platformProviderProfiles.profileFetchedAt,new Date(directory.startedAt)))));
    }
  });
}
async function upsertProfile(tx:Transaction,profile:ProviderPlatformProfile) {
  await tx.insert(platformProviderProfiles).values({...profile,isAvailable:true,profileFetchedAt:new Date()})
    .onConflictDoUpdate({target:[platformProviderProfiles.provider,platformProviderProfiles.externalId],set:{
      isAvailable:true,name:profile.name,normalizedName:profile.normalizedName,sourceUrl:profile.sourceUrl,
      imageId:profile.imageId,imageUrl:profile.imageUrl,profileFetchedAt:new Date(),updatedAt:new Date()}});
}
export async function savePlatformProfiles(lease:PlatformLogoJobLease,payload:PlatformLogoSyncPayload,provider:string,ids:string[],profiles:ProviderPlatformProfile[]) {
  if(profiles.some(profile=>profile.provider!==provider||!ids.includes(profile.externalId)))throw new Error('Провайдер вернул незапрошенную платформу.');
  await checkpointPlatformLogoJob(lease,payload,async tx=>{
    for(const profile of profiles)await upsertProfile(tx,profile);
    const missing=ids.filter(id=>!profiles.some(profile=>profile.externalId===id));
    if(missing.length)await tx.update(platformProviderProfiles).set({isAvailable:false,profileFetchedAt:new Date(),updatedAt:new Date()})
      .where(and(eq(platformProviderProfiles.provider,provider),inArray(platformProviderProfiles.externalId,missing)));
  });
}
export async function getPlatformDirectoryTargets(scopeIds:number[]) {
  const rows=scopeIds.length?await db.select().from(providerPlatformMappings).where(inArray(providerPlatformMappings.platformId,scopeIds)):[];
  return Object.fromEntries(['igdb','rawg'].map(provider=>[provider,{
    names:[...new Set(rows.filter(row=>row.provider===provider&&!row.externalPlatformId).map(row=>row.normalizedExternalPlatformName))],
    knownIds:[...new Set(rows.filter(row=>row.provider===provider&&row.externalPlatformId).map(row=>row.externalPlatformId!))],
  }])) as Record<'igdb'|'rawg',{names:string[];knownIds:string[]}>;
}
export async function getRecentCompletePlatformCatalogue() {
  const [run]=await db.select({payload:jobRuns.payload}).from(jobRuns).where(and(
    sql`${jobRuns.type}='media.platform-logos-sync'`,sql`${jobRuns.payload}->'checkpoint'->>'stage'='complete'`)).orderBy(desc(jobRuns.id)).limit(1);
  return (run?.payload as PlatformLogoSyncPayload|undefined)?.checkpoint??null;
}
export async function getPlatformLogoScope(platformId?:number) {
  const rows=await db.select({id:platforms.id}).from(platforms).where(platformId?eq(platforms.id,platformId):undefined).orderBy(asc(platforms.id));
  if(platformId&&!rows.length)throw new JobError('platform-not-found','Платформа не найдена.',{retryable:false});
  return rows.map(row=>row.id);
}
export async function getPlatformBindings(platformId:number) {
  return db.select({id:providerPlatformMappings.id,provider:providerPlatformMappings.provider,externalId:providerPlatformMappings.externalPlatformId,
    profileFetchedAt:platformProviderProfiles.profileFetchedAt,isAvailable:platformProviderProfiles.isAvailable})
    .from(providerPlatformMappings).leftJoin(platformProviderProfiles,and(eq(platformProviderProfiles.provider,providerPlatformMappings.provider),
      eq(platformProviderProfiles.externalId,providerPlatformMappings.externalPlatformId))).where(eq(providerPlatformMappings.platformId,platformId)).orderBy(asc(providerPlatformMappings.id));
}
export async function getMappedPlatformLogoProfiles(scopeIds:number[],afterKey:string) {
  if(!scopeIds.length)return [];
  return db.selectDistinct({provider:platformProviderProfiles.provider,externalId:platformProviderProfiles.externalId,imageId:platformProviderProfiles.imageId,
    imageUrl:platformProviderProfiles.imageUrl,imageKey:platformProviderProfiles.imageKey,imageObjectKey:platformProviderProfiles.imageObjectKey,imageContentHash:platformProviderProfiles.imageContentHash})
    .from(providerPlatformMappings).innerJoin(platformProviderProfiles,and(eq(providerPlatformMappings.provider,platformProviderProfiles.provider),
      eq(providerPlatformMappings.externalPlatformId,platformProviderProfiles.externalId)))
    .where(and(inArray(providerPlatformMappings.platformId,scopeIds),eq(platformProviderProfiles.isAvailable,true),
      sql`(${platformProviderProfiles.provider} || ':' || ${platformProviderProfiles.externalId}) > ${afterKey}`))
    .orderBy(asc(platformProviderProfiles.provider),asc(platformProviderProfiles.externalId)).limit(50);
}
export async function storePlatformLogoImageError(lease:PlatformLogoJobLease,payload:PlatformLogoSyncPayload,profile:{provider:string;externalId:string},message:string) {
  await checkpointPlatformLogoJob(lease,payload,async tx=>{
    await tx.update(platformProviderProfiles).set({imageError:message,updatedAt:new Date()}).where(and(eq(platformProviderProfiles.provider,profile.provider),eq(platformProviderProfiles.externalId,profile.externalId)));
  });
}

export async function getPlatformLogoJobCounters(scopeIds:number[],startedAt:string) {
  const [result]=await db.execute<{mappedIds:number;createdRequests:number;autoApproved:number;applied:number;manualPending:number;skipped:number;reusedImages:number;errors:number;storedImages:number;applying:number}>(sql`
    with scope as (select value::int id from jsonb_array_elements_text(${JSON.stringify(scopeIds)}::jsonb)),
    request_stats as (select count(*) filter(where r.created_at>=${startedAt}::timestamptz)::int "createdRequests",
      count(*) filter(where r.auto_approved and r.resolved_at>=${startedAt}::timestamptz)::int "autoApproved",
      count(*) filter(where r.apply_status='processed' and r.resolved_at>=${startedAt}::timestamptz)::int applied,
      count(*) filter(where r.decision is null or (r.apply_status='applying' and coalesce(j.status,'missing') not in ('queued','running')))::int "manualPending",
      count(*) filter(where r.decision='exclude')::int skipped,
      count(*) filter(where r.apply_status='failed' or (r.apply_status='applying' and coalesce(j.status,'missing') not in ('queued','running','succeeded')))::int request_errors,
      count(*) filter(where r.apply_status='applying' and j.status in ('queued','running'))::int applying
      from platform_requests r join scope s on s.id=r.target_platform_id left join job_runs j on j.id=r.job_run_id where r.kind='logo' and not r.superseded),
    mapping_stats as (select count(*) filter(where m.external_platform_id is not null)::int "mappedIds"
      from provider_platform_mappings m join scope s on s.id=m.platform_id),
    profile_scope as (select distinct p.provider,p.external_id,p.image_fetched_at,p.image_object_key,p.image_error from platform_provider_profiles p
      join provider_platform_mappings m on m.provider=p.provider and m.external_platform_id=p.external_id join scope s on s.id=m.platform_id),
    image_stats as (select count(*) filter(where image_object_key is not null and image_fetched_at<${startedAt}::timestamptz)::int "reusedImages",
      count(*) filter(where image_object_key is not null and image_fetched_at>=${startedAt}::timestamptz)::int "storedImages",
      count(*) filter(where image_error is not null)::int image_errors from profile_scope)
    select m.*,r.*,i."reusedImages",i."storedImages",(r.request_errors+i.image_errors)::int errors from mapping_stats m cross join request_stats r cross join image_stats i`);
  return result;
}
