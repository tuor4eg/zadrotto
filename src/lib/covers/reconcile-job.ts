import 'server-only';
import {
  commitCoverReconcileItem, getCoverReconcileBatch, getCoverReconcileBounds,
  reconcileUploadsReferenced, saveCoverReconcileCheckpoint,
} from '@/db/queries/cover-reconcile';
import type { SnapshotJobGuard } from '@/db/queries/provider-snapshots';
import { logSystemActivity } from '@/lib/activity-logs/system';
import { deleteS3Object } from '@/lib/services/minio';
import { JobError, type JobHandlerDefinition } from '@/lib/jobs/types';
import {
  COVER_RECONCILE_JOB_TYPE, emptyCoverReconcileCounters, parseCoverReconcilePayload,
  type CoverReconcileCheckpoint, type CoverReconcileItem, type CoverReconcilePayload,
} from './reconcile-model';
import { processReconcileCover, type ReconcileProcessResult } from './reconcile-process';

export const coverReconcileJobDependencies = {
  bounds: getCoverReconcileBounds, batch: getCoverReconcileBatch,
  checkpoint: saveCoverReconcileCheckpoint, commit: commitCoverReconcileItem,
  referenced: reconcileUploadsReferenced, remove: deleteS3Object, log: logSystemActivity, process: processReconcileCover,
};
export type CoverReconcileJobDependencies = typeof coverReconcileJobDependencies;

/** These namespaces contain per-attempt random keys; never delete an input cover. */
function ownedKeys(item: CoverReconcileItem, result: ReconcileProcessResult) {
  return [...new Set([result.objects?.coverUrl, result.objects?.coverThumbUrl])].filter((key): key is string =>
    Boolean(key && key !== item.coverUrl && key !== item.coverThumbUrl &&
      /^covers\/(?:media-items\/[^/]+-[0-9a-f]{8}-[0-9a-f]{3}|title-parts\/\d+-[0-9a-f-]{36}|reconcile-thumbs\/(?:media-item|title-part)-\d+-[0-9a-f-]{36})(?:-thumb)?\.[a-z0-9]+$/i.test(key)));
}

async function discardUnpublished(item: CoverReconcileItem, result: ReconcileProcessResult, deps: CoverReconcileJobDependencies) {
  const keys = ownedKeys(item, result);
  if (!keys.length) return;
  try {
    // A failed/ambiguous commit may have published these keys. Unknown means retain.
    if (await deps.referenced(item, keys)) return;
    await Promise.allSettled(keys.map(objectKey => deps.remove({ objectKey })));
  } catch {
    // Preserve the attempt's original error and retain potentially published objects.
  }
}

function progress(
  state: CoverReconcileCheckpoint, item: Pick<CoverReconcileItem, 'id' | 'kind'>, result: ReconcileProcessResult,
  applied: boolean, retry: boolean, retryCount: number,
): CoverReconcileCheckpoint {
  const previous = state.current?.id === item.id ? state.current : undefined;
  const findings = previous?.findings ?? result.findings;
  const restored = Boolean(previous?.restored || (applied && result.update));
  const replaced = Boolean(previous?.replaced || (applied && result.update && result.replacement));
  if (retry) return {
    ...state, current: { id: item.id, retryCount, findings, restored, replaced },
  };
  const counters = { ...state.counters, checked: state.counters.checked + 1 };
  if (findings?.missingOriginal) counters.missingOriginal++;
  if (findings?.missingThumbnail) counters.missingThumbnail++;
  if (findings?.empty) counters.empty++;
  if (restored) counters.restored++;
  if (replaced) counters.replaced++;
  if (result.status === 'healthy' && !restored) counters.healthy++;
  if (result.status === 'external') counters.external++;
  const conflict = Boolean(result.update && !applied);
  if (result.status === 'skipped' || conflict) counters.skipped++;
  const failed = !conflict && (result.status === 'failed' || result.status === 'retry');
  if (failed) counters.failed++;
  return {
    ...state, afterId: item.id, current: undefined, counters,
    errors: failed ? [...state.errors, { kind: item.kind, id: item.id, code: result.code.slice(0, 150) }].slice(-100) : state.errors,
  };
}

/** One bounded keyset batch; every publication and its progress share a fenced commit. */
export async function reconcileCovers(
  payload: CoverReconcilePayload, guard: SnapshotJobGuard, signal: AbortSignal,
  deps: CoverReconcileJobDependencies = coverReconcileJobDependencies,
): Promise<CoverReconcileCheckpoint> {
  signal.throwIfAborted();
  let state: CoverReconcileCheckpoint = payload.checkpoint
    ? structuredClone(payload.checkpoint)
    : { phase: 'media-items', afterId: 0, ...await deps.bounds(payload), counters: emptyCoverReconcileCounters(), errors: [] };
  const currentPayload = () => ({ ...payload, checkpoint: state });
  signal.throwIfAborted();
  await deps.checkpoint(guard, currentPayload());
  signal.throwIfAborted();
  let remaining = payload.batchSize;
  for (;;) {
    signal.throwIfAborted();
    const rows = await deps.batch({ ...currentPayload(), batchSize: Math.max(1, remaining) });
    if (state.current && rows[0]?.id !== state.current.id) {
      const deleted = { id: state.current.id, kind: state.phase === 'media-items' ? 'media-item' as const : 'title-part' as const };
      state = progress(state, deleted, { status: 'skipped', code: 'record-removed' }, false, false, 0);
      signal.throwIfAborted();
      await deps.checkpoint(guard, currentPayload());
      await deps.log({ action: 'media.cover-reconcile.issue', jobGuard: guard, entityType: 'media-item',
        message: 'Запись проверки удалена до продолжения.', metadata: { runId: guard.runId, kind: deleted.kind, recordId: deleted.id, code: 'record-removed' } });
    }
    if (!rows.length) {
      if (state.phase === 'media-items' && payload.includeParts && state.throughPartId > 0) {
        state = { ...state, phase: 'title-parts', afterId: 0, current: undefined };
        await deps.checkpoint(guard, currentPayload());
        continue;
      }
      await deps.log({ action: 'media.cover-reconcile.completed', jobGuard: guard, entityType: 'job-run', entityId: guard.runId,
        message: 'Проверка обложек завершена.', severity: state.counters.failed ? 'warning' : 'info',
        status: state.counters.failed ? 'failure' : 'success', metadata: { runId: guard.runId, mode: payload.mode, ...state.counters } });
      if (state.counters.failed) throw new JobError('cover-reconcile-partial', 'Проверка обложек завершена с ошибками. Подробности доступны в журнале.', { retryable: false });
      return state;
    }
    if (!remaining) throw new JobError('cover-reconcile-continue', 'Следующая партия проверки обложек.', { deferSeconds: 1 });
    for (const item of rows.slice(0, remaining)) {
      signal.throwIfAborted();
      const previous = state.current?.id === item.id ? state.current : undefined;
      const result = await deps.process(item, payload, signal);
      let published = false;
      try {
        signal.throwIfAborted();
        const retryCount = (previous?.retryCount ?? 0) + (result.deferSeconds || result.fatal ? 0 : 1);
        const shouldRetry = Boolean(result.deferSeconds || result.fatal ||
          (result.status === 'retry' && result.retryable !== false && retryCount < 3));
        const committed = await deps.commit({
          item, update: result.update, guard, signal,
          payload: applied => ({ ...payload, checkpoint: progress(state, item, result, applied,
            shouldRetry && !(result.update && !applied), retryCount) }),
        });
        published = committed.applied;
        state = committed.payload.checkpoint!;
        signal.throwIfAborted();
        const issue = result.status !== 'healthy' && result.status !== 'external';
        if (published || issue) await deps.log({
          action: published ? 'media.cover-reconcile.restored' : 'media.cover-reconcile.issue',
          jobGuard: guard, entityType: 'media-item', entityId: item.mediaItemId, entityLabel: item.title,
          message: published ? 'Обложка записи восстановлена.' : 'Результат проверки обложки записи.',
          severity: result.fatal || result.status === 'failed' || result.status === 'retry' ? 'warning' : 'info',
          status: result.fatal || result.status === 'failed' || (result.status === 'retry' && !state.current && !(result.update && !published)) ? 'failure' : 'success',
          metadata: { runId: guard.runId, kind: item.kind, recordId: item.id, code: result.code,
            mode: payload.mode, findings: previous?.findings ?? result.findings, replacement: result.replacement === true,
            applied: published, retryCount: state.current?.retryCount ?? 0 },
        });
        if (result.fatal) throw new JobError(result.code, 'Проверка обложек остановлена: хранилище недоступно.', { retryable: false });
        if (state.current) throw new JobError(result.deferSeconds ? 'cover-provider-deferred' : 'cover-record-retry',
          'Обработка обложки продолжится позже.', { deferSeconds: result.deferSeconds ?? 30 * Math.max(1, retryCount) });
      } finally {
        if (!published) await discardUnpublished(item, result, deps);
      }
      remaining--;
    }
    // The query returns one lookahead row; fetch again after consuming this batch.
  }
}

export const coverReconcileHandler: JobHandlerDefinition<CoverReconcilePayload> = {
  type: COVER_RECONCILE_JOB_TYPE, label: 'Проверка и восстановление обложек',
  schedulable: false, defaultMaxAttempts: 3, defaultTimeoutSeconds: 900,
  parsePayload: parseCoverReconcilePayload,
  async execute({ payload, runId, lockToken, signal, jobId }) {
    if (!lockToken || jobId !== null) throw new JobError('manual-only', 'Доступен только разовый запуск.', { retryable: false });
    await reconcileCovers(payload, { runId, lockToken }, signal);
  },
};
