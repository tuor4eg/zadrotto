import { getCoverProviderCredentialsForSearch } from "@/db/queries/cover-settings";
import { assertPlatformLogoJobLease, checkpointPlatformLogoJob, getMappedPlatformLogoProfiles, getPlatformBindings,
  getPlatformDirectoryTargets, getPlatformLogoJobCounters, getPlatformLogoScope, getRecentCompletePlatformCatalogue,
  savePlatformCataloguePage, savePlatformProfiles, storePlatformLogoImageError, type PlatformLogoJobLease } from "@/db/queries/platform-logo-jobs";
import { autoApprovePlatformAssetRequests, proposePlatformLogoRequests, resolveMissingPlatformProviderIds } from "@/db/queries/platform-logo-requests";
import { logSystemActivity } from "@/lib/activity-logs/system";
import { GameProviderDeferredError } from "@/lib/covers/game-provider-budget";
import { JobError, type JobHandlerDefinition } from "@/lib/jobs/types";
import { platformProviderApi, type PlatformProvider } from "./provider-api";
import { PLATFORM_LOGOS_SYNC_TYPE, parsePlatformLogoSyncPayload, type PlatformLogoSyncCheckpoint, type PlatformLogoSyncPayload } from "./logo-sync-model";
import { saveProviderPlatformImage } from "./provider-images";

const day=86_400_000;
function defer(seconds=1):never {throw new JobError("platform-logo-sync-continue","Продолжение синхронизации платформ.",{deferSeconds:seconds});}
async function progress(lease:PlatformLogoJobLease,payload:PlatformLogoSyncPayload,cp:PlatformLogoSyncCheckpoint) {
  const counts=await getPlatformLogoJobCounters(cp.scopeIds,cp.startedAt);
  cp.counters={...counts,recoveredIds:Math.max(0,counts.mappedIds-cp.initialMappedIds),
    processedPlatforms:cp.doneIds.length+cp.failedIds.length,remainingPlatforms:cp.scopeIds.length-cp.doneIds.length-cp.failedIds.length};
  await checkpointPlatformLogoJob(lease,payload);
  await logSystemActivity({action:cp.stage==="complete"?"media.platform-logos-sync.completed":"media.platform-logos-sync.progress",
    entityType:"job-run",entityId:lease.runId,
    message:`Логотипы платформ: обработано ${cp.counters.processedPlatforms}/${cp.scopeIds.length}, назначено ${counts.applied}, ожидают выбора ${counts.manualPending}, ошибок ${counts.errors+cp.failedIds.length}.`,
    metadata:{stage:cp.stage,...cp.counters,failedPlatforms:cp.failedIds}});
}
function advance(cp:PlatformLogoSyncCheckpoint) {cp.position++;cp.stage="identity";cp.afterImageKey="";delete cp.currentProvider;}
export const platformLogosSyncHandler:JobHandlerDefinition<PlatformLogoSyncPayload>={
  type:PLATFORM_LOGOS_SYNC_TYPE,label:"Синхронизация логотипов платформ",schedulable:false,
  defaultMaxAttempts:3,defaultRetryBaseSeconds:60,defaultRetryMaxSeconds:3600,defaultTimeoutSeconds:300,
  parsePayload:parsePlatformLogoSyncPayload,
  async execute({source,jobId,runId,lockToken,payload,signal}) {
    if(source!=="manual"||jobId!==null)throw new JobError("manual-only","Доступен только разовый ручной запуск.",{retryable:false});
    if(!lockToken)throw new JobError("lease-required","Требуется действующий lease.",{retryable:false});
    const lease={runId,lockToken};
    const run=await assertPlatformLogoJobLease(lease);
    if(!run.adminId)throw new JobError("admin-required","Запуск должен принадлежать администратору.",{retryable:false});
    const adminId=run.adminId;
    let cp=payload.checkpoint;
    if(!cp) {
      const scopeIds=await getPlatformLogoScope(payload.platformId);
      const targets=await getPlatformDirectoryTargets(scopeIds);
      const prior=payload.force?null:await getRecentCompletePlatformCatalogue();
      const startedAt=new Date().toISOString();
      const directory=Object.fromEntries((["igdb","rawg"] as const).map(provider=>{
        const old=prior?.version===2?prior.directory[provider]:undefined;
        const reusable=Boolean(old?.complete&&Date.now()-Date.parse(old.startedAt)<day&&targets[provider].names.every(name=>old.names.includes(name)));
        return [provider,{...targets[provider],cursor:0,complete:!targets[provider].names.length||reusable,startedAt:reusable?old!.startedAt:startedAt}];
      })) as PlatformLogoSyncCheckpoint["directory"];
      cp={version:2,scopeIds,queue:scopeIds,position:0,stage:"identity",directory,afterImageKey:"",
        retryIds:[],retryAt:{},attempts:{},doneIds:[],failedIds:[],startedAt,
        initialMappedIds:(await getPlatformLogoJobCounters(scopeIds,startedAt)).mappedIds};
      payload={...payload,checkpoint:cp};
      await checkpointPlatformLogoJob(lease,payload);
    }
    if(cp.stage==="complete")return;
    // Bound each worker execution; the durable stage advances independently for each platform.
    for(let processed=0;processed<50;processed++) {
      signal.throwIfAborted();
      if(cp.position>=cp.queue.length) {
        if(cp.retryIds.length) {
          const ready=cp.retryIds.filter(id=>Date.parse(cp.retryAt[id])<=Date.now());
          if(!ready.length) {
            await progress(lease,payload,cp);
            defer(Math.max(1,Math.ceil((Math.min(...cp.retryIds.map(id=>Date.parse(cp.retryAt[id])))-Date.now())/1000)));
          }
          cp.queue=ready;cp.retryIds=cp.retryIds.filter(id=>!ready.includes(id));cp.position=0;cp.stage="identity";cp.afterImageKey="";
          await checkpointPlatformLogoJob(lease,payload);
        } else {cp.stage="complete";await progress(lease,payload,cp);return;}
      }
      const platformId=cp.queue[cp.position];
      try {
        await assertPlatformLogoJobLease(lease);
        if(cp.stage==="identity") {
          const bindings=await getPlatformBindings(platformId);
          const missing=bindings.find(row=>!row.externalId&&(row.provider==="igdb"||row.provider==="rawg")&&!cp!.directory[row.provider].complete);
          if(missing) {cp.stage="catalogue";cp.currentProvider=missing.provider as PlatformProvider;}
          else {
            const ids=await resolveMissingPlatformProviderIds(platformId,lease);
            if(ids.missing||ids.ambiguous)await logSystemActivity({action:"media.platform-logos-sync.progress",entityType:"job-run",entityId:runId,
              message:`Платформа #${platformId}: пропущено ID без точного совпадения — ${ids.missing}, неоднозначных — ${ids.ambiguous}.`,
              metadata:{platformId,...ids}});
            cp.stage="profiles";
          }
          await checkpointPlatformLogoJob(lease,payload);
        }
        if(cp.stage==="catalogue") {
          const provider=cp.currentProvider!;
          const dir=cp.directory[provider];
          const credentials=await getCoverProviderCredentialsForSearch();
          const page=await platformProviderApi.fetchCataloguePage(provider,dir.cursor,{providerCredentials:credentials,backfill:true,signal});
          dir.cursor=page.nextCursor??0;dir.complete=page.nextCursor===null;
          // Keep the active provider for page filtering even when its final page advances the stage.
          await savePlatformCataloguePage(lease,payload,page.profiles,dir.complete?provider:undefined);
          if(dir.complete) {cp.stage="identity";delete cp.currentProvider;await checkpointPlatformLogoJob(lease,payload);}
          defer();
        }
        if(cp.stage==="profiles") {
          const bindings=await getPlatformBindings(platformId);
          const pending=bindings.find(row=>row.externalId&&(row.provider==="igdb"||row.provider==="rawg")&&
            (!row.profileFetchedAt||row.profileFetchedAt.getTime()<(payload.force?Date.parse(cp!.startedAt):Date.now()-day)));
          if(pending) {
            const provider=pending.provider as PlatformProvider;
            const ids=[...new Set(bindings.filter(row=>row.externalId&&row.provider===provider&&
              (!row.profileFetchedAt||row.profileFetchedAt.getTime()<(payload.force?Date.parse(cp!.startedAt):Date.now()-day))).map(row=>row.externalId!))]
              .slice(0,provider==="igdb"?100:1);
            const credentials=await getCoverProviderCredentialsForSearch();
            const profiles=await platformProviderApi.fetchProfiles(provider,ids,{providerCredentials:credentials,backfill:true,signal});
            await savePlatformProfiles(lease,payload,provider,ids,profiles);
            defer();
          }
          cp.stage="images";await checkpointPlatformLogoJob(lease,payload);
        }
        if(cp.stage==="images") {
          const images=await getMappedPlatformLogoProfiles([platformId],cp.afterImageKey);
          for(const profile of images) {
            signal.throwIfAborted();
            try {await saveProviderPlatformImage({lease,payload,profile,signal});}
            catch(error) {
              if(error instanceof GameProviderDeferredError||error instanceof JobError)throw error;
              await storePlatformLogoImageError(lease,payload,profile,"Не удалось сохранить логотип платформы.");
              throw error;
            }
            cp.afterImageKey=`${profile.provider}:${profile.externalId}`;
            await checkpointPlatformLogoJob(lease,payload);
          }
          if(images.length===50)defer();
          cp.stage="request";await checkpointPlatformLogoJob(lease,payload);
        }
        if(cp.stage==="request") {
          await proposePlatformLogoRequests(platformId,adminId);
          const result=await autoApprovePlatformAssetRequests(platformId,adminId);
          if(result.applying) {await progress(lease,payload,cp);defer(2);}
          cp.doneIds.push(platformId);delete cp.retryAt[platformId];
          advance(cp);await checkpointPlatformLogoJob(lease,payload);
        }
      } catch(error) {
        if(error instanceof GameProviderDeferredError) {
          await checkpointPlatformLogoJob(lease,payload);
          throw new JobError(error.code,"Ожидание доступного лимита провайдера.",{deferSeconds:error.retryAfterSeconds});
        }
        if(error instanceof JobError)throw error;
        signal.throwIfAborted();
        const attempts=(cp.attempts[platformId]??0)+1;cp.attempts[platformId]=attempts;
        if(attempts<3) {if(!cp.retryIds.includes(platformId))cp.retryIds.push(platformId);cp.retryAt[platformId]=new Date(Date.now()+60*2**(attempts-1)*1000).toISOString();}
        else cp.failedIds.push(platformId);
        await logSystemActivity({action:"media.platform-logos-sync.progress",entityType:"job-run",entityId:runId,
          message:`Не удалось обработать логотип платформы #${platformId}; ${attempts<3?"повтор после остальных платформ":"повторы исчерпаны"}.`,
          metadata:{platformId,attempts}});
        advance(cp);await checkpointPlatformLogoJob(lease,payload);
      }
    }
    await progress(lease,payload,cp);defer();
  },
};
