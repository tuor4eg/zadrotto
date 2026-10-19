import { autoApproveGameCompanyRequests } from "@/db/queries/creator-requests";
import { logSystemActivity } from "@/lib/activity-logs/system";
import { eq, sql } from "drizzle-orm";
import { db } from "@/db";
import { mediaItems } from "@/db/schema";
import { getCoverProviderCredentialsForSearch } from "@/db/queries/cover-settings";
import { claimGameCompanyBackfill, checkpointGameCompanyItem, finishGameCompanyBackfill, getGameCompanyBackfillProgress, GAME_COMPANY_BACKFILL_TYPE, getCachedGameCompanyRoster, getGameCompanyBackfillBatch, isCurrentGameCompanySource, mergeGameCompanyMetadata } from "@/db/queries/game-company-backfill";
import { saveGameCompanyRoster } from "@/db/queries/game-companies";
import { fetchGameCompanyRosters } from "@/lib/creators/game-company-api";
import { enrichGameCompanyProfiles } from "@/lib/creators/game-company-images";
import { GameProviderDeferredError } from "@/lib/covers/game-provider-budget";
import { JobError, type JobHandlerDefinition } from "@/lib/jobs/types";
import type { GameCompanyProvider } from "./game-companies";

type Item = Awaited<ReturnType<typeof getGameCompanyBackfillBatch>>[number];
function deferProvider(error: unknown): void {
  if (error instanceof GameProviderDeferredError) throw new JobError(error.code,error.message,{deferSeconds:error.retryAfterSeconds});
}
async function fail(item: Item, error: unknown) {
  deferProvider(error);
  const attempts = item.attempts + 1;
  await checkpointGameCompanyItem(item,{attempts,status:attempts>=3?'error':item.references?'ready':'pending',error:error instanceof Error?error.message:'Ошибка импорта.'});
  return attempts>=3 ? 1 : Math.ceil(60 * 2 ** (attempts-1) * (1 + Math.random()*0.1));
}
export const gameCompanyBackfillHandler: JobHandlerDefinition<Record<string, never>> = {
  type:GAME_COMPANY_BACKFILL_TYPE,label:"Разработчики и издатели игр: импорт с автоапрувом",schedulable:false,defaultMaxAttempts:3,defaultTimeoutSeconds:300,
  parsePayload(value) {
    if (!value || typeof value !== 'object' || Array.isArray(value) || Object.keys(value).length) throw new JobError('invalid-payload','Ожидался пустой объект.',{retryable:false});
    return {};
  },
  async execute({source,jobId,runId,signal}) {
    if (source !== 'manual' || jobId !== null) throw new JobError('manual-only','Доступен только разовый ручной запуск.',{retryable:false});
    const operationId = await claimGameCompanyBackfill(runId);
    if (operationId === null) return;
    try {
      // Include requests left by an earlier/manual-only import, including completed game checkpoints.
      await autoApproveGameCompanyRequests({ signal });
      const batch = await getGameCompanyBackfillBatch(operationId);
      if (!batch.length) { await finishGameCompanyBackfill(operationId); return; }
      const credentials = await getCoverProviderCredentialsForSearch();
      let retryDelay=1;
      for (const provider of ['igdb','rawg'] as const) {
        const pending = batch.filter(item=>item.provider===provider && item.references===null);
        // Cached evidence survives interrupted operations and never needs another API call.
        const uncached: Item[]=[];
        for (const item of pending) {
          signal.throwIfAborted();
          if (!await isCurrentGameCompanySource(item)) {await checkpointGameCompanyItem(item,{status:'skipped'});continue;}
          const cached = await getCachedGameCompanyRoster(item);
          if (cached !== undefined) {item.references=cached;await checkpointGameCompanyItem(item,{references:cached,status:'ready'});} else uncached.push(item);
        }
        const groups = provider==='igdb' ? [uncached] : uncached.map(item=>[item]);
        for (const group of groups) {
          if (!group.length) continue;
          signal.throwIfAborted();
          try {
            const rosters = await fetchGameCompanyRosters(provider,group.map(item=>item.sourceExternalId),{providerCredentials:credentials,backfill:true,signal});
            for (const item of group) {
              const roster=rosters.find(value=>value.externalId===item.sourceExternalId);
              if (!roster) {retryDelay=Math.max(retryDelay,await fail(item,new Error('Провайдер не вернул полный состав игры.')));continue;}
              item.references=roster.references;
              await checkpointGameCompanyItem(item,{references:roster.references,status:'ready',error:null});
            }
          } catch(error) {signal.throwIfAborted();deferProvider(error);for(const item of group) retryDelay=Math.max(retryDelay,await fail(item,error));}
        }
      }
      const failedProfiles = new Set<number>();
      const igdbReady = batch.filter(item=>item.provider==='igdb' && item.references!==null);
      const igdbCompanyIds = [...new Set(igdbReady.flatMap(item=>item.references!.map(ref=>ref.externalId)))];
      if (igdbCompanyIds.length) {
        try {await enrichGameCompanyProfiles('igdb',igdbCompanyIds,signal,true);}
        catch(error) {
          signal.throwIfAborted();
          deferProvider(error);
          const failedIds = error && typeof error === 'object' && 'externalIds' in error && Array.isArray(error.externalIds)
            ? new Set<string>(error.externalIds as string[]) : null;
          for(const item of igdbReady) {
            if (failedIds && !item.references!.some(ref=>failedIds.has(ref.externalId))) continue;
            retryDelay=Math.max(retryDelay,await fail(item,error));
            failedProfiles.add(item.mediaItemId);
          }
        }
      }
      for(const item of batch) {
        if(item.references===null || (item.provider==='igdb' && failedProfiles.has(item.mediaItemId))) continue;
        signal.throwIfAborted();
        try {
          if(!await isCurrentGameCompanySource(item)) {await checkpointGameCompanyItem(item,{status:'skipped'});continue;}
          const provider=item.provider as GameCompanyProvider;
          // Profiles are checkpoints themselves: already fetched data and images are reused.
          if(provider==='rawg') await enrichGameCompanyProfiles(provider,[...new Set(item.references.map(ref=>ref.externalId))],signal,true);
          await db.transaction(async tx=>{
            await tx.select({id:mediaItems.id}).from(mediaItems).where(eq(mediaItems.id,item.mediaItemId)).for('update');
            // Sources can change during network requests; verify under the entry lock.
            const current=await tx.execute<{present:boolean}>(
              sql`select exists(select 1 from media_item_metadata where media_item_id=${item.mediaItemId} and source_provider=${provider} and source_external_id=${item.sourceExternalId} union all select 1 from media_item_provider_snapshots where media_item_id=${item.mediaItemId} and provider_code=${provider} and external_id=${item.sourceExternalId}) present`);
            if(!current[0]?.present) {await checkpointGameCompanyItem(item,{status:"skipped"},tx);return;}
            const result=await saveGameCompanyRoster(tx,{mediaItemId:item.mediaItemId,provider,sourceExternalId:item.sourceExternalId,references:item.references!,enqueueEnrichment:false});
            await mergeGameCompanyMetadata(tx,item,item.references!);
            await checkpointGameCompanyItem(item,{status:"done",usedBindings:result.usedBindings,newRequests:result.newRequests,error:null},tx);
          });
          await autoApproveGameCompanyRequests({ provider, externalIds: [...new Set(item.references.map(ref => ref.externalId))], signal });
        } catch(error) {signal.throwIfAborted();retryDelay=Math.max(retryDelay,await fail(item,error));}
      }
      throw new JobError('backfill-continue','Продолжение восстановления.',{deferSeconds:retryDelay});
    } finally {
      const progress = await getGameCompanyBackfillProgress(operationId);
      if (progress) await logSystemActivity({
        action: progress.status === "active" ? "media.game-companies-backfill.progress" : "media.game-companies-backfill.completed",
        entityType: "job-run", entityId: runId,
        message: `Организации игр: завершено ${progress.done} из ${progress.total}, ошибок ${progress.errors}, новых заявок ${progress.newRequests}.`,
        metadata: progress,
      });
    }
  },
};
