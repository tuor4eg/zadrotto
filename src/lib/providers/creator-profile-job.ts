import { eq, sql } from "drizzle-orm";
import { db } from "@/db";
import { jobRuns, providerCreatorBindings } from "@/db/schema";
import { attachCreatorProfileSnapshot, creatorProfileBindingBatchQuery } from "@/db/queries/creator-profile-snapshots";
import { withSnapshotJobGuard, type SnapshotJobGuard } from "@/db/queries/provider-snapshots";
import { getCoverProviderRateLimits } from "@/db/queries/cover-settings";
import { createProviderCoverSearchRateLimiter, wrapProviderSearchWithReserve } from "@/lib/covers/rate-limits";
import { GameProviderDeferredError } from "@/lib/covers/game-provider-budget";
import { JobError } from "@/lib/jobs/types";
import { creatorProfileTargetFromBinding, type CreatorProfileTarget } from "./creator-profile-targets";
import { fetchCreatorProfileSnapshot } from "./creator-profile-service";
import { snapshotItemError } from "./snapshot-item-errors";
import type { SnapshotJobPayload } from "./snapshot-job-payload";

/** One bounded batch. Raw is durable before optional attachment; neither step applies working fields. */
export async function runCreatorProfileSnapshots(payload: SnapshotJobPayload, guard: SnapshotJobGuard, signal: AbortSignal, reuseAfter: Date, dependencies: { fetchProfile?: typeof fetchCreatorProfileSnapshot; getLimits?: typeof getCoverProviderRateLimits } = {}) {
  const external = payload.profileTargets;
  const [max] = external ? [{ id: 0 }] : await db.select({ id: sql<number>`coalesce(max(${providerCreatorBindings.id}),0)::int` }).from(providerCreatorBindings);
  let state: NonNullable<SnapshotJobPayload["profileCheckpoint"]> = payload.profileCheckpoint ?? {
    afterBindingId: payload.afterId ?? 0, throughBindingId: payload.throughId ?? max.id, nextTargetIndex: 0, processed: 0, failed: 0, errors: [],
  };
  const save = async (next: typeof state) => {
    await withSnapshotJobGuard(guard, async tx => { await tx.update(jobRuns).set({ payload: { ...payload, profileCheckpoint: next }, updatedAt: new Date() }).where(eq(jobRuns.id, guard.runId)); });
    state = next;
  };
  await save(state);
  const batchSize = payload.batchSize ?? 25;
  const bindingRows = external ? [] : await creatorProfileBindingBatchQuery({ provider: payload.provider, creatorIds: payload.creatorIds,
    bindingIds: payload.bindingIds, afterId: state.afterBindingId, throughId: state.throughBindingId, batchSize,
    // Include an interrupted identity whose raw may have committed before attachment.
    onlyMissingSnapshots: payload.onlyMissingSnapshots });
  const targets = external ? external.slice(state.nextTargetIndex, state.nextTargetIndex + batchSize).map((target, index) => ({ target, index: state.nextTargetIndex + index,
    bindingId: undefined as number | undefined, creatorId: undefined as number | undefined }))
    : bindingRows.slice(0, batchSize).map(row => ({ target: creatorProfileTargetFromBinding(row), index: 0, bindingId: row.id, creatorId: row.creatorId }));
  const limits = await (dependencies.getLimits ?? getCoverProviderRateLimits)();
  const limiter = createProviderCoverSearchRateLimiter(limits);
  const before = wrapProviderSearchWithReserve(limiter.canSearchProvider, limits, 100);
  const beforeRequest = async (provider: CreatorProfileTarget["provider"]) => {
    const allowed = await before(provider);
    if (typeof allowed === "string") throw new JobError("provider-deferred", "Лимит запросов провайдера исчерпан. Обработка продолжится позже.", { deferSeconds: 60 });
  };
  for (const item of targets) {
    signal.throwIfAborted();
    const next = { ...state, retryCount: undefined, processed: state.processed + 1,
      ...(external ? { nextTargetIndex: item.index + 1 } : { afterBindingId: item.bindingId! }) };
    try {
      if (!item.target) throw new Error("INVALID_CREATOR_PROFILE_TARGET");
      const snapshot = await (dependencies.fetchProfile ?? fetchCreatorProfileSnapshot)(item.target, { signal, jobGuard: guard, reuseAfter,
        onlyMissing: payload.onlyMissingSnapshots, beforeRequest });
      signal.throwIfAborted();
      if (item.creatorId && item.bindingId) {
        await attachCreatorProfileSnapshot({ creatorId: item.creatorId, bindingId: item.bindingId,
          ref: { id: snapshot.id, payloadHash: snapshot.payloadHash }, jobGuard: guard,
          checkpoint: { ...payload, profileCheckpoint: next } });
        state = next;
      } else await save(next);
    } catch (error) {
      signal.throwIfAborted();
      if (error instanceof JobError && error.code === "lease-lost") throw error;
      if (error instanceof JobError && error.deferSeconds !== null) throw error;
      if (error instanceof GameProviderDeferredError) throw new JobError(error.code, "Ожидание доступного лимита провайдера.", { deferSeconds: error.retryAfterSeconds });
      const http = error && typeof error === "object" && "status" in error ? Number(error.status) : null;
      const retryAfter = error && typeof error === "object" && "retryAfterSeconds" in error ? Number(error.retryAfterSeconds) : 60;
      if (http === 429) throw new JobError("provider-deferred", "Провайдер ограничил частоту запросов. Обработка продолжится позже.", { deferSeconds: Math.max(1, retryAfter) });
      const message = error instanceof Error ? error.message : "";
      const permanent = ["PROVIDER_SOURCE_CHANGED", "SNAPSHOT_ENTITY_NOT_FOUND", "INVALID_CREATOR_PROFILE_TARGET", "INVALID_CREATOR_PROFILE_RESPONSE", "INVALID_CREATOR_SNAPSHOT", "PROVIDER_SNAPSHOT_CHANGED"].includes(message)
        || (http !== null && http >= 400 && http < 500);
      const retries = (state.retryCount ?? 0) + 1;
      if (!permanent && retries < 3) {
        await save({ ...state, retryCount: retries });
        throw new JobError("provider-retry", "Повторная попытка получения исходного профиля.", { deferSeconds: 60 * retries });
      }
      await save({ ...state, ...(external ? { nextTargetIndex: item.index + 1 } : { afterBindingId: item.bindingId! }), retryCount: undefined,
        failed: state.failed + 1, errors: [...state.errors, { ...snapshotItemError(item.bindingId ?? item.index + 1, error), target: item.target ?? undefined, creatorId: item.creatorId, bindingId: item.bindingId }].slice(-100) });
    }
  }
  const more = external ? state.nextTargetIndex < external.length : bindingRows.length > batchSize;
  if (more) throw new JobError("provider-continue", "Следующая партия исходных профилей.", { deferSeconds: Math.max(1, Math.ceil((payload.batchPauseHours ?? 0) * 3600)) });
  if (state.failed) throw new JobError("snapshot-items-failed", `Обработка профилей завершена с ошибками: ${state.failed}. См. причины в отчёте.`, { retryable: false });
}
