import { fetchBggMetadata, getSavedBggBundle, getBggMigrationComparison } from "./bgg-service";
import { transferBggSnapshot, BggSnapshotDifferenceError } from "@/db/queries/bgg-snapshot-transfer";
import { fetchGameMetadata, getSavedGameBundle, getGameMigrationComparison } from "./game-service";
import { transferGameSnapshot, GameSnapshotDifferenceError } from "@/db/queries/game-snapshot-transfer";
import { fetchAniListCreatorSnapshot, getSavedAniListCreatorSnapshot, getAniListCreatorMigrationComparison } from "./anilist-creators-service";
import { commitAniListCreatorSnapshot } from "@/db/queries/anilist-creators";
import { runWithProviderRequestTimeout } from "@/lib/covers/provider-request-timeout";
import { fetchTmdbSeriesMetadata, getSavedTmdbSeriesBundle, getTmdbSeriesMigrationComparison } from "./tmdb-series-service";
import { getSavedCreatorProfileSnapshot, fetchCreatorProfileSnapshot } from "./creator-profile-service";
import { runCreatorProfileSnapshots } from "./creator-profile-job";
import { fetchTmdbFilmMetadata, getSavedTmdbFilmBundle, getTmdbFilmMigrationComparison } from "./tmdb-film-service";
import { providerSnapshotAnimeBatchQuery, providerSnapshotBookBatchQuery, providerSnapshotGameBatchQuery, providerSnapshotBoardgameBatchQuery } from "@/db/queries/provider-snapshot-jobs";
import "server-only";
import { eq, inArray, sql } from "drizzle-orm";
import { db } from "@/db";
import { creators, jobRuns, mediaItems, mediaItemMetadata, providerSnapshots } from "@/db/schema";
import { commitCreatorSnapshot, creatorSnapshotBatchQuery, getCreatorSnapshotState } from "@/db/queries/creator-provider-snapshots";
import { fetchCreatorSnapshot, getSavedCreatorSnapshot } from "./creator-service";
import { getCoverProviderCredentialsForSearch, getCoverProviderRateLimits, getCoverProviderSettings, getCoverSettings } from "@/db/queries/cover-settings";
import { createProviderCoverSearchRateLimiter, wrapProviderSearchWithReserve } from "@/lib/covers/rate-limits";
import { upsertMediaItemMetadata } from "@/db/queries/media-item-metadata";
import { attachProviderSnapshots, withSnapshotJobGuard, type SnapshotJobGuard } from "@/db/queries/provider-snapshots";
import { JobError, type JobHandlerDefinition } from "@/lib/jobs/types";
import { fetchBookMetadata, getSavedBookBundle, isBookSnapshotProvider } from "./book-service";
import { OpenLibraryWorkRedirectError } from "./book-adapters";
import { snapshotItemError, snapshotItemErrorMessage, snapshotProviderDeferral } from "./snapshot-item-errors";
import type { SnapshotReference } from "./snapshot-values";

export {PROVIDER_SNAPSHOT_JOB_TYPE, SNAPSHOT_OPERATIONS, parseSnapshotJobPayload} from "./snapshot-job-payload";
import {PROVIDER_SNAPSHOT_JOB_TYPE, parseSnapshotJobPayload, getSnapshotBatchSettings, type SnapshotJobPayload} from "./snapshot-job-payload";
async function checkpoint(guard: SnapshotJobGuard, payload: SnapshotJobPayload) {
  await withSnapshotJobGuard(guard, async tx=>{
    await tx.update(jobRuns).set({payload:payload as unknown as Record<string,unknown>,updatedAt:new Date()}).where(eq(jobRuns.id,guard.runId));
  });
}

async function runCreatorSnapshots(payload: SnapshotJobPayload, guard: SnapshotJobGuard, signal: AbortSignal, reuseAfter: Date) {
  const [max] = await db.select({ id: sql<number>`coalesce(max(${creators.id}),0)::int` }).from(creators);
  let state: NonNullable<SnapshotJobPayload["checkpoint"]> = payload.checkpoint ?? {
    afterId: payload.afterId ?? 0, throughId: payload.throughId ?? max.id, processed: 0, failed: 0, errors: [],
  };
  await checkpoint(guard, { ...payload, checkpoint: state });
  const batch = getSnapshotBatchSettings({ ...payload, checkpoint: state });
  const tmdbNetwork = payload.provider === "tmdb" && payload.operation !== "process";
  const limits = tmdbNetwork ? await getCoverProviderRateLimits() : [];
  const limiter = createProviderCoverSearchRateLimiter(limits);
  const beforeRequest = wrapProviderSearchWithReserve(limiter.canSearchProvider, limits, 100);
  const candidates = await creatorSnapshotBatchQuery({ afterId: state.afterId, throughId: state.throughId, creatorIds: payload.creatorIds, batchSize: batch.remaining,
    onlyMissingSnapshots: payload.onlyMissingSnapshots, retryId: state.retryId, provider: payload.provider === "tmdb" ? "tmdb" : "fantlab" });
  for (const row of candidates.slice(0, batch.remaining)) {
    signal.throwIfAborted();
    if (payload.onlyMissingSnapshots) {
      state = { ...state, retryId: row.id };
      await checkpoint(guard, { ...payload, checkpoint: state });
    }
    try {
      const creator = await getCreatorSnapshotState(row.id, db, payload.provider === "tmdb" ? "tmdb" : "fantlab");
      if (!creator) throw new Error("SNAPSHOT_ENTITY_NOT_FOUND");
      if (creator.bindings.length !== 1) throw new Error(creator.bindings.length ? "CREATOR_BINDING_AMBIGUOUS" : "CREATOR_BINDING_MISSING");
      const binding = creator.bindings[0];
      const target = { provider: "tmdb" as const, resourceType: "person" as const, externalId: binding.externalCreatorId.replace(/^person:/, "") };
      const snapshot = payload.provider === "tmdb" ? (payload.operation === "process" ? await getSavedCreatorProfileSnapshot(target) : await fetchCreatorProfileSnapshot(target, { signal, jobGuard: guard, reuseAfter, onlyMissing: payload.onlyMissingSnapshots, beforeRequest: async provider => { if (typeof await beforeRequest(provider) === "string") throw new JobError("provider-deferred", "Лимит запросов TMDB исчерпан.", { deferSeconds: 60 }); } })) : payload.operation === "process" ? await getSavedCreatorSnapshot(binding.externalCreatorId)
        : await fetchCreatorSnapshot(binding.externalCreatorId, { signal, jobGuard: guard,
          reuseAfter: payload.onlyMissingSnapshots ? new Date(0) : reuseAfter });
      signal.throwIfAborted();
      const next = { ...state, afterId: row.id, processed: state.processed + 1, retryId: undefined, retryCount: undefined };
      const result = await commitCreatorSnapshot({ creatorId: row.id, bindingId: binding.id, externalId: binding.externalCreatorId,
        provider: payload.provider === "tmdb" ? "tmdb" : "fantlab", ref: { id: snapshot.id, payloadHash: snapshot.payloadHash }, process: payload.operation !== "refresh", jobGuard: guard,
        checkpoint: { ...payload, checkpoint: next } });
      state = { ...next, diagnostics: [...(next.diagnostics ?? []), ...(result.diagnostics.length ? [{ id: row.id, codes: result.diagnostics }] : [])].slice(-100) };
    } catch (error) {
      signal.throwIfAborted();
      if (error instanceof JobError && ["lease-lost", "provider-deferred"].includes(error.code)) throw error;
      const message = error instanceof Error ? error.message : "";
      const http = error && typeof error === "object" && "status" in error ? Number(error.status) : null;
      const retryAfter = error && typeof error === "object" && "retryAfterSeconds" in error ? Number(error.retryAfterSeconds) : 60;
      if (http === 429) throw new JobError("provider-deferred", payload.provider === "tmdb" ? "TMDB ограничил частоту запросов." : "FantLab ограничил частоту запросов.", { deferSeconds: Math.max(60, retryAfter) });
      const retries = state.retryId === row.id ? (state.retryCount ?? 0) + 1 : 1;
      const permanent = ["CREATOR_BINDING_MISSING", "CREATOR_BINDING_AMBIGUOUS", "SNAPSHOT_ENTITY_NOT_FOUND", "PROVIDER_SOURCE_CHANGED", "PROVIDER_SNAPSHOT_MISSING", "INVALID_CREATOR_SNAPSHOT"].includes(message)
        || (http !== null && http >= 400 && http < 500);
      if (!permanent && retries < 3) {
        state = { ...state, retryId: row.id, retryCount: retries };
        await checkpoint(guard, { ...payload, checkpoint: state });
        throw new JobError("provider-retry", "Повторная попытка обработки создателя.", { deferSeconds: Math.max(60 * retries, retryAfter) });
      }
      state = { ...state, afterId: row.id, failed: state.failed + 1, retryId: undefined, retryCount: undefined,
        errors: [...state.errors, snapshotItemError(row.id, error)].slice(-100) };
      await checkpoint(guard, { ...payload, checkpoint: state });
    }
  }
  if (candidates.length > batch.remaining) throw new JobError("provider-continue", "Следующая партия создателей.", { deferSeconds: batch.pauseSeconds });
  if (state.failed) throw new JobError("snapshot-items-failed", `Обработка создателей завершена с ошибками: ${state.failed}.`, { retryable: false });
}
export const providerSnapshotJobHandler: JobHandlerDefinition<SnapshotJobPayload> = {
  type:PROVIDER_SNAPSHOT_JOB_TYPE,label:"Снимки провайдеров: обновление, обработка и проверка",schedulable:false,
  defaultMaxAttempts:3,defaultTimeoutSeconds:300,
  parsePayload:parseSnapshotJobPayload,
  async execute({runId,lockToken,signal,payload,jobId}) {
    if (!lockToken || jobId!==null) throw new JobError("manual-only","Доступен только разовый запуск.",{retryable:false});
    const guard={runId,lockToken};
    const [run]=await db.select({createdAt:jobRuns.createdAt}).from(jobRuns).where(eq(jobRuns.id,runId));
    if (payload.profileTargets || (payload.entityType === "creator" && payload.operation === "refresh" && !payload.checkpoint))
      return runCreatorProfileSnapshots(payload, guard, signal, run.createdAt);
    if (payload.entityType === "creator") return runCreatorSnapshots(payload, guard, signal, run.createdAt);
    const [max]=await db.select({id:sql<number>`coalesce(max(${mediaItems.id}),0)::int`}).from(mediaItems);
    let state=payload.checkpoint ?? {afterId:payload.afterId??0,throughId:payload.throughId??max.id,processed:0,failed:0,errors:[]};
    let current={...payload,checkpoint:state};
    await checkpoint(guard,current);
    const batch = getSnapshotBatchSettings(current);
    const batchInput={afterId:state.afterId,throughId:state.throughId,mediaItemIds:payload.mediaItemIds,batchSize:batch.remaining,onlyMissingSnapshots:payload.onlyMissingSnapshots,retryId:state.retryId};
    const candidates=await (payload.mediaType === "anime" ? providerSnapshotAnimeBatchQuery(batchInput)
      : payload.mediaType === "boardgame" ? providerSnapshotBoardgameBatchQuery(batchInput)
      : payload.mediaType === "game" ? providerSnapshotGameBatchQuery({ ...batchInput, provider: payload.provider as "igdb" | "rawg" | undefined })
      : providerSnapshotBookBatchQuery({...batchInput,mediaType:payload.mediaType,provider:payload.provider as import("./types").BookProviderCode | "tmdb" | undefined}));
    const rows=candidates.slice(0,batch.remaining);
    const network=payload.operation==="refresh" || payload.operation==="refresh-process";
    const [settings,providerSettings,limits,credentials]=network ? await Promise.all([getCoverSettings(),getCoverProviderSettings(),getCoverProviderRateLimits(),getCoverProviderCredentialsForSearch()]) : [null,[],[],{}];
    const limiter=createProviderCoverSearchRateLimiter(limits);
    const before=wrapProviderSearchWithReserve(limiter.canSearchProvider,limits,100);
    for (const row of rows) {
      signal.throwIfAborted();
      if (payload.onlyMissingSnapshots) {
        // Raw can commit before applying metadata; retain this row on resume.
        state={...state,retryId:row.id};
        await checkpoint(guard,{...payload,checkpoint:state});
      }
      const anime = row.mediaType === "anime";
      const game = row.mediaType === "game";
      const boardgame = row.mediaType === "boardgame";
      if (!row.provider || !row.externalId || (anime ? !["anilist", "jikan"].includes(row.provider) : boardgame ? row.provider !== "bgg" : game ? !["igdb", "rawg"].includes(row.provider) : !isBookSnapshotProvider(row.provider) && row.provider !== "tmdb")) {
        state={...state,afterId:row.id,failed:state.failed+1,retryId:undefined,retryCount:undefined,errors:[...state.errors,{id:row.id,code:"missing-source"}].slice(-100)};
        await checkpoint(guard,{...payload,checkpoint:state});continue;
      }
      try {
        if (network && !providerSettings.some(item=>item.mediaType===row.mediaType && item.providerCode===(anime ? "anilist" : row.provider) && item.enabled!==false)) throw new Error("provider-disabled");
        let refs: SnapshotReference[];
        if (anime) {
          if (network) {
            const evidence=await runWithProviderRequestTimeout(settings!.providerRequestTimeoutMs, () => fetchAniListCreatorSnapshot({provider:row.provider as "anilist"|"jikan",externalId:row.externalId!,mediaType:"anime"}, {
              candidateLimit:1,tmdbResultScanLimit:1,requestTimeoutMs:settings!.providerRequestTimeoutMs,beforeProviderSearch:before,snapshotJobGuard:guard,
              snapshotReuseAfter:payload.onlyMissingSnapshots ? new Date(0) : run.createdAt,signal,
            }));
            if (!evidence) throw new Error("ANILIST_MEDIA_MISSING");
            refs=evidence;
          } else {
            const snapshot=await getSavedAniListCreatorSnapshot(row.provider,row.externalId);
            if (!snapshot) throw new Error("PROVIDER_SNAPSHOT_MISSING");
            refs=[{id:snapshot.id,payloadHash:snapshot.payloadHash}];
          }
        } else if (network) {
          const metadata=await (boardgame ? fetchBggMetadata : game ? fetchGameMetadata : row.provider === "tmdb" ? row.mediaType === "series" ? fetchTmdbSeriesMetadata : fetchTmdbFilmMetadata : fetchBookMetadata)({provider:row.provider as import("./types").BookProviderCode | "tmdb" | "igdb" | "rawg" | "bgg",externalId:row.externalId,mediaType:row.mediaType},{candidateLimit:1,tmdbResultScanLimit:1,requestTimeoutMs:settings!.providerRequestTimeoutMs,
            providerCredentials:credentials,beforeProviderSearch:before,snapshotJobGuard:guard,snapshotReuseAfter:payload.onlyMissingSnapshots ? new Date(0) : run.createdAt,signal});
          refs=metadata.snapshotReferences!;
        } else {
          const bundle = boardgame ? await getSavedBggBundle(row.externalId) : game ? await getSavedGameBundle(row.provider as "igdb" | "rawg", row.externalId) : row.provider === "tmdb" ? row.mediaType === "series" ? await getSavedTmdbSeriesBundle(row.externalId) : await getSavedTmdbFilmBundle(row.externalId) : await getSavedBookBundle(row.provider as import("./types").BookProviderCode,row.externalId);
          refs = [bundle.primary,...bundle.dependencies].map(item=>({id:item.id,payloadHash:item.payloadHash}));
        }
        const nextState={...state,afterId:row.id,processed:state.processed+1,retryId:undefined,retryCount:undefined};
        current={...payload,checkpoint:nextState};
        if (anime && payload.operation !== "verify") {
          await commitAniListCreatorSnapshot({mediaItemId:row.id,expectedSource:{provider:row.provider,externalId:row.externalId},references:refs,
            process:payload.operation!=="refresh",jobGuard:guard,checkpoint:current as unknown as Record<string,unknown>});
        } else if (payload.operation==="process" || payload.operation==="refresh-process") {
          if (boardgame && payload.applyBoardgameChanges !== true) await transferBggSnapshot({mediaItemId:row.id,externalId:row.externalId,refs,
            expectedSource:{provider:row.provider,externalId:row.externalId},jobGuard:guard,checkpoint:current as unknown as Record<string,unknown>});
          else if (game && payload.applyGameChanges !== true) await transferGameSnapshot({mediaItemId:row.id,provider:row.provider as "igdb"|"rawg",externalId:row.externalId,refs,
            expectedSource:{provider:row.provider,externalId:row.externalId},jobGuard:guard,checkpoint:current as unknown as Record<string,unknown>});
          else await upsertMediaItemMetadata({mediaItemId:row.id,facts:{},sourceProvider:row.provider,sourceExternalId:row.externalId,
            snapshotReferences:refs,enqueueCompanyLogos:network,jobGuard:guard,expectedSource:{provider:row.provider,externalId:row.externalId},checkpoint:current as unknown as Record<string,unknown>});
        } else if (payload.operation==="refresh") {
          await withSnapshotJobGuard(guard, async tx=>{
            // Refresh-only attaches evidence, never changes working metadata or contributors.
            const [source]=await tx.select().from(mediaItems).where(eq(mediaItems.id,row.id)).for("update");
            const [metadata]=await tx.select().from(mediaItemMetadata).where(eq(mediaItemMetadata.mediaItemId,row.id));
            if (!source || source.mediaType !== row.mediaType || metadata?.sourceProvider!==row.provider || metadata.sourceExternalId!==row.externalId) throw new Error("PROVIDER_SOURCE_CHANGED");
            const bundle=await tx.select({id:providerSnapshots.id,resourceType:providerSnapshots.resourceType}).from(providerSnapshots).where(inArray(providerSnapshots.id,refs.map(ref=>ref.id)));
            await attachProviderSnapshots(tx,{entityType:"media-item",entityId:String(row.id)},refs.map(ref=>({...ref,purpose:bundle.find(item=>item.id===ref.id)?.resourceType==="author"?"dependency":"primary"})),{kind:"system"});
            await tx.update(jobRuns).set({payload:current as unknown as Record<string,unknown>,updatedAt:new Date()}).where(eq(jobRuns.id,runId));
          });
        } else {
          // Verification is read-only for domain data; its report is the job checkpoint.
          const animeSnapshot = anime ? await getSavedAniListCreatorSnapshot(row.provider,row.externalId) : null;
          if (anime && !animeSnapshot) throw new Error("PROVIDER_SNAPSHOT_MISSING");
          const report = boardgame ? await getBggMigrationComparison(row.id, (await getSavedBggBundle(row.externalId)).projection) : game ? await getGameMigrationComparison(row.id, (await getSavedGameBundle(row.provider as "igdb" | "rawg", row.externalId)).projection) : anime ? await getAniListCreatorMigrationComparison(row.id,animeSnapshot!) : row.provider === "tmdb"
            ? row.mediaType === "series" ? await getTmdbSeriesMigrationComparison(row.id,(await getSavedTmdbSeriesBundle(row.externalId)).projection) : await getTmdbFilmMigrationComparison(row.id,(await getSavedTmdbFilmBundle(row.externalId)).projection)
            : await (await import("./snapshot-report")).getBookMigrationComparison(row.id,(await getSavedBookBundle(row.provider as import("./types").BookProviderCode,row.externalId)).projection);
          if (report.blockers.length) throw new Error("migration-difference");
          await checkpoint(guard,current);
        }
        state=nextState;
      } catch(error) {
        signal.throwIfAborted();
        const code=error instanceof Error?error.message:"provider-error";
        if (code==="STALE_SNAPSHOT_JOB" || (error instanceof JobError && error.code==="lease-lost")) throw error;
        const retryAfter=error && typeof error==="object" && "retryAfterSeconds" in error ? Number(error.retryAfterSeconds) : null;
        const deferral = snapshotProviderDeferral(error, row.id);
        if (deferral) throw new JobError("provider-deferred", deferral.message, { deferSeconds: deferral.deferSeconds });
        const retries=state.retryId===row.id?(state.retryCount??0)+1:1;
        const permanent=error instanceof BggSnapshotDifferenceError || error instanceof GameSnapshotDifferenceError || error instanceof OpenLibraryWorkRedirectError || payload.operation==="verify" || ["PROVIDER_SOURCE_CHANGED","provider-disabled","ANILIST_MEDIA_MISSING","AMBIGUOUS_ANILIST_SNAPSHOTS"].includes(code);
        if (!permanent && retries<3) {
          state={...state,retryId:row.id,retryCount:retries};
          await checkpoint(guard,{...payload,checkpoint:state});
          throw new JobError("provider-retry","Повторная попытка обработки записи.",{deferSeconds:Math.max(60*retries,retryAfter??0)});
        }
        state={...state,afterId:row.id,failed:state.failed+1,retryId:undefined,retryCount:undefined,errors:[...state.errors,snapshotItemError(row.id,error)].slice(-100)};
        if (error instanceof GameSnapshotDifferenceError || error instanceof BggSnapshotDifferenceError) state={...state,diagnostics:[...(state.diagnostics ?? []),{id:row.id,codes:error.diagnostics.slice(0,10)}].slice(-100)};
        await checkpoint(guard,{...payload,checkpoint:state});
      }
    }
    if (candidates.length>batch.remaining) throw new JobError("provider-continue",batch.batchPauseHours>0 ? `Пауза между партиями: ${batch.batchPauseHours} ч.` : "Следующая партия обработки.",{deferSeconds:batch.pauseSeconds});
    if (state.failed) throw new JobError("snapshot-items-failed",`Обработка завершена с ошибками: ${state.failed}.${state.errors.length ? ` Запись №${state.errors[0].id}: ${snapshotItemErrorMessage(state.errors[0])}` : ""}`,{retryable:false});
  },
};
