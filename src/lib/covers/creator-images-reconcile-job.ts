import { platformImagesReconcileUpperId, platformImagesReconcileBatch } from "@/db/queries/platform-images-reconcile";
import { processPlatformLogo } from "./platform-images-reconcile";
import { createHash, randomUUID } from "node:crypto";
import { creatorImagesReconcileUploadReferenced, creatorImagesReconcileBatch, creatorImagesReconcileUpperId, commitCreatorImagesReconcile, saveCreatorImagesReconcileCheckpoint, type CreatorImagesReconcileRow } from "@/db/queries/creator-images-reconcile";
import type { SnapshotJobGuard } from "@/db/queries/provider-snapshots";
import { logSystemActivity } from "@/lib/activity-logs/system";
import { AVATAR_MAX_BYTES } from "@/lib/avatars/config";
import { transformCreatorAvatarBuffer, isCreatorAvatarObjectKey } from "@/lib/creators/avatar-storage";
import { transformCompanyLogo } from "@/lib/creators/game-company-images";
import { JobError, type JobHandlerDefinition } from "@/lib/jobs/types";
import { deleteS3Object, probeS3Object, S3UploadError, uploadS3Object } from "@/lib/services/minio";
import { fetchProviderImage, isSafeProviderImageUrl } from "./provider-image-relay";
import { isCoverProviderCode } from "./types";
import { CREATOR_IMAGES_RECONCILE_JOB_TYPE, emptyCreatorImagesReconcileCounters, parseCreatorImagesReconcilePayload, type CreatorImagesReconcilePayload, type CreatorImagesReconcileCheckpoint } from "./creator-images-reconcile-model";

const defaults = { platformUpperId: platformImagesReconcileUpperId, platformBatch: platformImagesReconcileBatch, platformProcess: processPlatformLogo, upperId: creatorImagesReconcileUpperId, batch: creatorImagesReconcileBatch, save: saveCreatorImagesReconcileCheckpoint, commit: commitCreatorImagesReconcile,
  log: logSystemActivity, referenced: creatorImagesReconcileUploadReferenced, remove: deleteS3Object,
  probe: probeS3Object, fetchImage: fetchProviderImage, portrait: transformCreatorAvatarBuffer, logo: transformCompanyLogo, upload: uploadS3Object };
export type CreatorImagesReconcileDependencies = Partial<typeof defaults>;
class ImageFailure extends Error {
  constructor(readonly code: string, readonly retryable: boolean, readonly fatal = false) { super(code); }
}
export function creatorImageReconcileSource(row: CreatorImagesReconcileRow) {
  const { avatarSource: provider, avatarOriginalUrl: imageUrl } = row.creator;
  return provider && isCoverProviderCode(provider) && imageUrl && isSafeProviderImageUrl(provider, imageUrl) ? { providerCode: provider, imageUrl } : null;
}
export async function runCreatorImagesReconcile(input: CreatorImagesReconcilePayload, guard: SnapshotJobGuard, signal: AbortSignal, dependencies: CreatorImagesReconcileDependencies = {}) {
  const d = { ...defaults, ...dependencies };
  signal.throwIfAborted();
  const scope = input.creatorId ? "creators" : input.platformId ? "platforms" : input.scope ?? "all";
  let state: CreatorImagesReconcileCheckpoint = input.checkpoint ? structuredClone(input.checkpoint) : {
    phase: scope === "platforms" ? "platforms" : "creators", afterId: 0,
    throughId: scope === "platforms" ? 0 : await d.upperId(input.creatorId),
    throughPlatformId: scope === "creators" ? 0 : await d.platformUpperId(input.platformId),
    counters: emptyCreatorImagesReconcileCounters(), errors: [],
  };
  // Old creator-only checkpoints remain readable after introducing a second phase.
  state.phase ??= "creators";
  state.throughPlatformId ??= scope === "creators" ? 0 : await d.platformUpperId(input.platformId);
  const payload = (checkpoint: CreatorImagesReconcileCheckpoint) => ({ ...input, checkpoint });
  const save = (checkpoint: CreatorImagesReconcileCheckpoint) => d.save(guard, payload(checkpoint));
  const log = async (outcome: string, row?: CreatorImagesReconcileRow, code?: string) => d.log({
    action: "media.creator-images-reconcile", jobGuard: guard, entityType: row ? "creator" : "job-run", entityId: row?.creator.id ?? guard.runId,
    message: row ? "Проверка изображения создателя." : "Проверка изображений создателей завершена.",
    metadata: { runId: guard.runId, mode: input.mode, outcome, code: code ?? null, ...(row ? {} : { counters: state.counters }) },
    status: outcome === "failed" ? "failure" : "success", severity: outcome === "failed" ? "warning" : "info",
  });
  await save(state);
  if (state.phase === "platforms") return runPlatformImagesPhase(input, state, guard, signal, d);
  const rows = await d.batch({ ...input, afterId: state.afterId, throughId: state.throughId });
  for (const row of rows.slice(0, input.batchSize)) {
    signal.throwIfAborted();
    const next: CreatorImagesReconcileCheckpoint = { ...state, current: undefined, afterId: row.creator.id, counters: { ...state.counters, checked: state.counters.checked + 1 } };
    let uploadedKey: string | null = null;
    let published = false;
    try {
      const key = row.creator.avatarObjectKey;
      if (!key || !isCreatorAvatarObjectKey(key) || !key.startsWith(`avatars/creators/${row.creator.id}/`)) next.counters.skipped++;
      else {
        const result = await d.probe({ objectKey: key, signal });
        signal.throwIfAborted();
        if (result.status === "error") throw new ImageFailure(result.code, result.retryable, result.fatal);
        if (result.status === "exists") next.counters.healthy++;
        else {
          next.counters.missing++;
          await log("missing", row);
          if (input.mode === "repair") {
            const source = creatorImageReconcileSource(row);
            if (!source) next.counters.skipped++;
            else {
              const image = await d.fetchImage({ ...source, signal, maxBytes: AVATAR_MAX_BYTES });
              signal.throwIfAborted();
              if (!image.ok) throw new ImageFailure(image.status ? `ImageHttp${image.status}` : `Image-${image.error}`, image.retryable ?? false);
              let body: Buffer;
              try { body = await (row.typeCode === "organization" ? d.logo(image.body) : d.portrait(image.body)); }
              catch { throw new ImageFailure("InvalidImage", false); }
              signal.throwIfAborted();
              const objectKey = `avatars/creators/${row.creator.id}/${randomUUID()}.webp`;
              uploadedKey = objectKey;
              try { await d.upload({ objectKey, body, contentType: "image/webp", signal }); }
              catch (error) {
                if (error instanceof S3UploadError) throw new ImageFailure(`StorageHttp${error.status}`, error.status === 429 || error.status >= 500, error.status !== 429 && error.status < 500);
                throw new ImageFailure("StorageNetwork", true);
              }
              signal.throwIfAborted();
              const recheck = await d.probe({ objectKey: key, signal });
              signal.throwIfAborted();
              if (recheck.status === "error") throw new ImageFailure(recheck.code, recheck.retryable, recheck.fatal);
              if (recheck.status === "exists") {
                next.counters.skipped++;
                await save(next); state = next;
                await log("skipped", row, "OriginalRestoredConcurrently");
                continue;
              }
              next.counters.restored++;
              const committed = await d.commit({ row, objectKey, signal, contentHash: createHash("sha256").update(body).digest("hex"), guard, payload: payload(next) });
              if (committed) { published = true; state = next; await log("restored", row); continue; }
              next.counters.restored--; next.counters.skipped++;
            }
          }
        }
      }
      await save(next);
      if (next.counters.skipped > state.counters.skipped) await log("skipped", row, creatorImageReconcileSource(row) ? "StateChangedOrNoObject" : "NoSafeSavedSource");
      state = next;
    } catch (error) {
      signal.throwIfAborted();
      if (!(error instanceof ImageFailure)) throw error;
      if (error.fatal) {
        await log("failed", row, error.code);
        await save({ ...state, errors: [...state.errors, { creatorId: row.creator.id, code: error.code }].slice(-100) });
        throw new JobError("creator-images-storage-fatal", "Проверка остановлена: хранилище недоступно или неверно настроено.", { retryable: false });
      }
      const retryCount = (state.current?.id === row.creator.id ? state.current.retryCount : 0) + 1;
      if (error.retryable && retryCount < 3) {
        await save({ ...state, current: { id: row.creator.id, retryCount } });
        throw new JobError("creator-images-retry", "Повтор проверки изображения создателя.", { deferSeconds: 30 * retryCount });
      }
      next.counters.failed++; next.errors = [...state.errors, { creatorId: row.creator.id, code: error.code }].slice(-100);
      await save(next); state = next;
      await log("failed", row, error.code);
    } finally {
      if (uploadedKey && !published) {
        try {
          // On an ambiguous commit, an unknown reference state means retain the object.
          if (!await d.referenced(row.creator.id, uploadedKey)) await d.remove({ objectKey: uploadedKey });
        } catch { /* Preserve the original failure and potentially published objects. */ }
      }
    }
  }
  if (rows.length > input.batchSize) throw new JobError("creator-images-continue", "Следующая партия изображений создателей.", { deferSeconds: 1 });
  if (scope !== "creators" && (state.throughPlatformId ?? 0) > 0) {
    state = { ...state, phase: "platforms", afterId: 0, current: undefined };
    await save(state);
    throw new JobError("creator-images-continue", "Продолжение проверки логотипов платформ.", { deferSeconds: 1 });
  }
  await log("completed");
  if (state.counters.failed) throw new JobError("creator-images-partial", "Проверка завершена с ошибками; подробности доступны в результате запуска.", { retryable: false });
}
/** Platform restoration keeps the approved object key and never edits domain data. */
async function runPlatformImagesPhase(
  input: CreatorImagesReconcilePayload, initial: CreatorImagesReconcileCheckpoint,
  guard: SnapshotJobGuard, signal: AbortSignal, d: typeof defaults,
) {
  let state = initial;
  const save = (checkpoint: CreatorImagesReconcileCheckpoint) => d.save(guard, { ...input, checkpoint });
  const log = (outcome: string, platformId?: number, code?: string) => d.log({
    action: "media.creator-images-reconcile", jobGuard: guard,
    entityType: "job-run", entityId: guard.runId,
    message: platformId ? "Проверка логотипа платформы." : "Проверка фотографий и логотипов завершена.",
    metadata: { runId: guard.runId, platformId: platformId ?? null, mode: input.mode, outcome, code: code ?? null, ...(platformId ? {} : { counters: state.counters }) },
    status: outcome === "failed" || (outcome === "completed" && state.counters.failed > 0) ? "failure" : "success",
    severity: outcome === "failed" || (outcome === "completed" && state.counters.failed > 0) ? "warning" : "info",
  });
  signal.throwIfAborted();
  const rows = await d.platformBatch({ afterId: state.afterId, throughId: state.throughPlatformId!, batchSize: input.batchSize, platformId: input.platformId });
  if (state.current && rows[0]?.platform.id !== state.current.id) {
    const deletedId = state.current.id;
    state = { ...state, afterId: deletedId, current: undefined, counters: { ...state.counters, checked: state.counters.checked + 1, skipped: state.counters.skipped + 1 } };
    await save(state);
    await log("skipped", deletedId, "PlatformRemoved");
  }
  for (const row of rows.slice(0, input.batchSize)) {
    signal.throwIfAborted();
    const result = await d.platformProcess(row, input.mode, guard, signal);
    signal.throwIfAborted();
    if (result.status === "fatal") {
      await save({ ...state, errors: [...state.errors, { platformId: row.platform.id, code: result.code }].slice(-100) });
      await log("failed", row.platform.id, result.code);
      throw new JobError("creator-images-storage-fatal", "Проверка остановлена: хранилище недоступно или неверно настроено.", { retryable: false });
    }
    const retryCount = (state.current?.id === row.platform.id ? state.current.retryCount : 0) + 1;
    if (result.status === "retry" && retryCount < 3) {
      await save({ ...state, current: { id: row.platform.id, retryCount } });
      await log("retry", row.platform.id, result.code);
      throw new JobError("creator-images-retry", "Повтор проверки логотипа платформы.", { deferSeconds: 30 * retryCount });
    }
    const counters = { ...state.counters, checked: state.counters.checked + 1 };
    if (result.manualMissing || result.importedMissing) counters.missing++;
    if (result.status === "healthy") counters.healthy++;
    if (result.status === "restored") counters.restored++;
    if (result.status === "skipped" || (input.mode === "repair" && result.manualMissing)) counters.skipped++;
    const failed = result.status === "failed" || result.status === "retry";
    if (failed) counters.failed++;
    state = { ...state, afterId: row.platform.id, current: undefined, counters,
      errors: failed ? [...state.errors, { platformId: row.platform.id, code: result.code }].slice(-100) : state.errors };
    await save(state);
    if (result.status !== "healthy") await log(failed ? "failed" : result.status, row.platform.id, result.code);
  }
  if (rows.length > input.batchSize) throw new JobError("creator-images-continue", "Следующая партия логотипов платформ.", { deferSeconds: 1 });
  await log("completed");
  if (state.counters.failed) throw new JobError("creator-images-partial", "Проверка завершена с ошибками; подробности доступны в результате запуска.", { retryable: false });
}
export const creatorImagesReconcileHandler: JobHandlerDefinition<CreatorImagesReconcilePayload> = {
  type: CREATOR_IMAGES_RECONCILE_JOB_TYPE, label: "Проверка фотографий и логотипов", schedulable: false, defaultMaxAttempts: 3, defaultTimeoutSeconds: 900,
  parsePayload: parseCreatorImagesReconcilePayload,
  async execute({ payload, signal, runId, lockToken, jobId }) {
    if (!lockToken || jobId !== null) throw new JobError("manual-only", "Доступен только разовый запуск.", { retryable: false });
    await runCreatorImagesReconcile(payload, { runId, lockToken }, signal);
  },
};
