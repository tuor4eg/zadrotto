import { eq } from "drizzle-orm";
import { db } from "@/db";
import { jobRuns } from "@/db/schema";
import { creatorImagesBatchQuery, creatorImagesScopeQuery, validateCreatorImageFilters } from "@/db/queries/creator-images";
import { withSnapshotJobGuard, type SnapshotJobGuard } from "@/db/queries/provider-snapshots";
import { getCoverProviderRateLimits } from "@/db/queries/cover-settings";
import { createProviderCoverSearchRateLimiter, wrapProviderSearchWithReserve } from "@/lib/covers/rate-limits";
import { GameProviderDeferredError } from "@/lib/covers/game-provider-budget";
import { JobError, type JobHandlerDefinition } from "@/lib/jobs/types";
import { fillCreatorImage } from "./image-fill";
import { parseCreatorImageRefreshPayload, parseCreatorImageFillPayload, parseCreatorImagesPayload, type CreatorImageCheckpoint, type CreatorImagesPayload } from "./image-policy";

async function imageBeforeRequest() {
  const limits = await getCoverProviderRateLimits();
  const limiter = createProviderCoverSearchRateLimiter(limits);
  const before = wrapProviderSearchWithReserve(limiter.canSearchProvider, limits, 100);
  return async (provider: Parameters<typeof before>[0]) => {
    if (typeof await before(provider) === "string") throw new JobError("provider-deferred", "Ожидание доступного лимита провайдера.", { deferSeconds: 60 });
  };
}
export function creatorImageError(error: unknown): JobError {
  if (error instanceof JobError) return error;
  if (error instanceof GameProviderDeferredError) return new JobError(error.code, "Ожидание доступного лимита провайдера.", { deferSeconds: error.retryAfterSeconds });
  const http = error && typeof error === "object" && "status" in error ? Number(error.status) : null;
  const retry = error && typeof error === "object" && "retryAfterSeconds" in error ? Number(error.retryAfterSeconds) : 60;
  if (http === 429) return new JobError("provider-deferred", "Провайдер ограничил частоту запросов.", { deferSeconds: Number.isFinite(retry) ? Math.max(1, retry) : 60 });
  const message = error instanceof Error ? error.message : "";
  const permanent = ["INVALID_CREATOR_PROFILE_RESPONSE", "INVALID_CREATOR_SNAPSHOT", "INVALID_CREATOR_IMAGE", "INVALID_CREATOR_IMAGE_FILTER", "PROVIDER_SOURCE_CHANGED", "SNAPSHOT_ENTITY_NOT_FOUND"].includes(message) || (http !== null && http >= 400 && http < 500);
  return new JobError("creator-image-failed", "Не удалось заполнить изображение создателя.", { retryable: !permanent });
}
export const creatorImageFillHandler: JobHandlerDefinition<ReturnType<typeof parseCreatorImageFillPayload>> = {
  type: "media.creator-image-fill", label: "Изображение нового создателя", schedulable: false, defaultMaxAttempts: 3, defaultTimeoutSeconds: 300,
  parsePayload: parseCreatorImageFillPayload,
  async execute({ payload, signal, runId, lockToken }) {
    if (!lockToken) throw new JobError("lease-lost", "Задача потеряла право выполнения.", { retryable: false });
    const guard = { runId, lockToken };
    try {
      const outcome = await fillCreatorImage(payload.creatorId, signal, { guard, bindingFingerprint: payload.bindingFingerprint, refreshCompanySearch: payload.refreshCompanySearch, beforeRequest: await imageBeforeRequest() });
      await withSnapshotJobGuard(guard, async tx => { await tx.update(jobRuns).set({ payload: { ...payload, outcome }, updatedAt: new Date() }).where(eq(jobRuns.id, runId)); });
    } catch (error) { signal.throwIfAborted(); throw creatorImageError(error); }
  },
};
export async function runCreatorImagesBatch(input: CreatorImagesPayload, guard: SnapshotJobGuard, signal: AbortSignal, dependencies: { fill?: typeof fillCreatorImage; beforeRequest?: Awaited<ReturnType<typeof imageBeforeRequest>> } = {}) {
  const [run] = await db.select({ payload: jobRuns.payload }).from(jobRuns).where(eq(jobRuns.id, guard.runId));
  const payload = parseCreatorImagesPayload(run?.payload ?? input);
  await validateCreatorImageFilters(payload);
  let state: CreatorImageCheckpoint;
  if (payload.checkpoint) state = payload.checkpoint;
  else {
    const [scope] = await creatorImagesScopeQuery(payload);
    state = { afterId: 0, throughId: scope.throughId, total: scope.total, processed: 0, failed: 0, storedImages: 0, missingImages: 0, skipped: 0, errors: [] };
  }
  const save = async (checkpoint: CreatorImageCheckpoint) => withSnapshotJobGuard(guard, async tx => {
    await tx.update(jobRuns).set({ payload: { ...payload, checkpoint }, updatedAt: new Date() }).where(eq(jobRuns.id, guard.runId));
  });
  await save(state);
  if (!state.total) return;
  const beforeRequest = dependencies.beforeRequest ?? await imageBeforeRequest();
  const rows = await creatorImagesBatchQuery({ ...payload, afterId: state.afterId, throughId: state.throughId });
  for (const row of rows.slice(0, payload.batchSize)) {
    signal.throwIfAborted();
    const next: CreatorImageCheckpoint = { ...state, afterId: row.id, processed: state.processed + 1, retryCount: undefined };
    const stored = { ...next, storedImages: next.storedImages + 1 };
    try {
      const outcome = await (dependencies.fill ?? fillCreatorImage)(row.id, signal, { guard, beforeRequest, checkpoint: { ...payload, checkpoint: stored } });
      if (outcome === "stored") { state = stored; continue; }
      if (outcome === "missing-image") next.missingImages++;
      else next.skipped++;
      await save(next); state = next;
    } catch (error) {
      signal.throwIfAborted();
      const failure = creatorImageError(error);
      if (failure.code === "lease-lost" || failure.deferSeconds !== null) throw failure;
      const retryCount = (state.retryCount ?? 0) + 1;
      if (failure.retryable && retryCount < 3) {
        await save({ ...state, retryCount });
        throw new JobError("creator-image-retry", "Повторная попытка загрузки изображения.", { deferSeconds: 60 * retryCount });
      }
      const failed = { ...state, afterId: row.id, retryCount: undefined, failed: state.failed + 1, errors: [...state.errors, { creatorId: row.id, code: failure.code }].slice(-100) };
      await save(failed); state = failed;
    }
  }
  if (rows.length > payload.batchSize) throw new JobError("creator-images-continue", "Следующая партия изображений создателей.", { deferSeconds: 1 });
  if (state.failed) throw new JobError("creator-images-partial", `Заполнение изображений завершено с ошибками: ${state.failed}. Повторный запуск обработает оставшиеся пустые изображения.`, { retryable: false });
}
export const creatorImagesBackfillHandler: JobHandlerDefinition<CreatorImagesPayload> = {
  type: "media.creator-images-backfill", label: "Заполнить изображения создателей", schedulable: false, defaultMaxAttempts: 3, defaultTimeoutSeconds: 900,
  parsePayload: parseCreatorImagesPayload,
  async execute({ payload, signal, runId, lockToken, jobId }) {
    if (!lockToken || jobId !== null) throw new JobError("manual-only", "Доступен только разовый запуск.", { retryable: false });
    await runCreatorImagesBatch(payload, { runId, lockToken }, signal);
  },
};

export const creatorImageRefreshHandler: JobHandlerDefinition<ReturnType<typeof parseCreatorImageRefreshPayload>> = {
  type: "media.creator-image-refresh", label: "Обновить изображение создателя", schedulable: false, defaultMaxAttempts: 3, defaultTimeoutSeconds: 300,
  parsePayload: parseCreatorImageRefreshPayload,
  async execute({ payload, signal, runId, lockToken }) {
    if (!lockToken) throw new JobError("lease-lost", "Задача потеряла право выполнения.", { retryable: false });
    const guard = { runId, lockToken };
    try {
      const outcome = await fillCreatorImage(payload.creatorId, signal, { guard, refreshBindingId: payload.bindingId, beforeRequest: await imageBeforeRequest() });
      await withSnapshotJobGuard(guard, async tx => { await tx.update(jobRuns).set({ payload: { ...payload, outcome }, updatedAt: new Date() }).where(eq(jobRuns.id, runId)); });
    } catch (error) { signal.throwIfAborted(); throw creatorImageError(error); }
  },
};
