import { getPendingComicVineItemsQuery } from "@/db/queries/comic-vine-pending";
import "server-only";
import { and, eq, sql } from "drizzle-orm";
import { db } from "@/db";
import { jobRuns, mediaItems, mediaItemMetadata } from "@/db/schema";
import { applyComicVineIssueAggregation } from "@/db/queries/comic-vine-issue-aggregation";
import { withSnapshotJobGuard } from "@/db/queries/provider-snapshots";
import { getCoverSettings, getCoverProviderSettings, getCoverProviderRateLimits, getCoverProviderCredentialsForSearch } from "@/db/queries/cover-settings";
import { createProviderCoverSearchRateLimiter, wrapProviderSearchWithReserve } from "@/lib/covers/rate-limits";
import { JobError, type JobHandlerContext } from "@/lib/jobs/types";
import { getSavedComicVineBundle, fetchComicVineSnapshot, getLinkedComicVineIssueIds } from "./comic-vine-service";
import { describeComicVineIssue } from "./comic-vine-adapter";
import { comicVineIssueIds } from "./comic-vine-issue-aggregation";
import { snapshotItemError, snapshotItemErrorMessage, snapshotProviderDeferral } from "./snapshot-item-errors";

export const COMIC_VINE_ISSUES_JOB_TYPE = "media.comic-vine-issue-creators";
export type ComicIssueItemPayload = { mediaItemId: number; checkpoint?: { externalId: string; volumeId: number; volumeHash: string; processed: number; total: number } };
export function parseComicVineIssueItemPayload(value: unknown): ComicIssueItemPayload {
  if (!value || typeof value !== "object" || Array.isArray(value)) throw new JobError("invalid-payload", "Укажите ID записи.", { retryable: false });
  const input = value as Record<string, unknown>;
  if (!Number.isSafeInteger(input.mediaItemId) || Number(input.mediaItemId) < 1 || Number(input.mediaItemId) > 2147483647) throw new JobError("invalid-payload", "Некорректный ID записи.", { retryable: false });
  const state = input.checkpoint as ComicIssueItemPayload["checkpoint"];
  if (state && (typeof state.externalId !== "string" || !/^[1-9]\d*$/.test(state.externalId) || !Number.isSafeInteger(state.volumeId) || state.volumeId < 1 || typeof state.volumeHash !== "string" || !Number.isSafeInteger(state.processed) || state.processed < 0 || !Number.isSafeInteger(state.total) || state.total < state.processed)) throw new JobError("invalid-payload", "Некорректный прогресс задачи.", { retryable: false });
  return { mediaItemId: Number(input.mediaItemId), ...(state ? { checkpoint: state } : {}) };
}

export async function runComicVineIssueItem(
  { payload, runId, lockToken, signal }: JobHandlerContext<ComicIssueItemPayload>,
  wrapPayload: (item: ComicIssueItemPayload) => Record<string, unknown> = item => item,
  budget?: { remaining: number; consume: () => Promise<void> },
) {
    if (!lockToken) throw new JobError("lease-lost", "Потеряна блокировка задачи.", { retryable: false });
    const guard = { runId, lockToken };
    try {
      signal.throwIfAborted();
      const { mediaItemMetadata } = await import("@/db/schema");
      const [item] = await db.select({ provider: mediaItemMetadata.sourceProvider, externalId: mediaItemMetadata.sourceExternalId, mediaType: mediaItems.mediaType, disabled: mediaItems.metadataSearchDisabled }).from(mediaItems)
        .innerJoin(mediaItemMetadata, eq(mediaItemMetadata.mediaItemId, mediaItems.id)).where(eq(mediaItems.id, payload.mediaItemId));
      if (!item || item.mediaType !== "comic" || item.provider !== "comic-vine" || !item.externalId) throw new JobError("missing-source", "У записи нет источника Comic Vine.", { retryable: false });
      if (item.disabled) throw new JobError("metadata-disabled", "Для записи отключён поиск метаданных.", { retryable: false });
      const bundle = await getSavedComicVineBundle(payload.mediaItemId, item.externalId);
      const primary = bundle.primary;
      const ids = comicVineIssueIds(primary);
      const previous = payload.checkpoint;
      if (previous && (previous.externalId !== item.externalId || previous.volumeId !== primary.id || previous.volumeHash !== primary.payloadHash || previous.total !== ids.length)) throw new JobError("source-changed", "Снимок тома изменился. Создайте новый запуск.", { retryable: false });
      let processed = previous?.processed ?? 0;
      const linked = await getLinkedComicVineIssueIds(payload.mediaItemId);
      while (processed < ids.length && linked.has(ids[processed])) processed++;
      const [settings, providers, limits, credentials] = await Promise.all([getCoverSettings(), getCoverProviderSettings(), getCoverProviderRateLimits(), getCoverProviderCredentialsForSearch()]);
      if (!providers.some(provider => provider.mediaType === "comic" && provider.providerCode === "comic-vine" && provider.enabled !== false)) throw new JobError("provider-disabled", "Включите Comic Vine для комиксов.", { retryable: false });
      const limiter = createProviderCoverSearchRateLimiter(limits);
      const before = wrapProviderSearchWithReserve(limiter.canSearchProvider, limits, 100);
      const save = async (issue?: { id: number; payloadHash: string }) => {
        signal.throwIfAborted();
        await withSnapshotJobGuard(guard, async tx => {
          await applyComicVineIssueAggregation(tx, { mediaItemId: payload.mediaItemId, externalId: item.externalId!, volume: { id: primary.id, payloadHash: primary.payloadHash }, issue, guard });
          await tx.update(jobRuns).set({ payload: wrapPayload({ mediaItemId: payload.mediaItemId, checkpoint: { externalId: item.externalId!, volumeId: primary.id, volumeHash: primary.payloadHash, processed, total: ids.length } }), updatedAt: new Date() }).where(eq(jobRuns.id, runId));
        });
      };
      // Pin the volume before the first network request, including an empty volume.
      if (!previous) await save();
      const through = Math.min(ids.length, processed + Math.min(5, budget?.remaining ?? 5));
      while (processed < through) {
        signal.throwIfAborted();
        if (linked.has(ids[processed])) { processed++; continue; }
        // Charge attempts before requesting, including failed requests and crash recovery.
        await budget?.consume();
        const issue = await fetchComicVineSnapshot(describeComicVineIssue(ids[processed]), { candidateLimit: 1, tmdbResultScanLimit: 1, requestTimeoutMs: settings.providerRequestTimeoutMs, providerCredentials: credentials, beforeProviderSearch: before, snapshotJobGuard: guard, snapshotReuseAfter: new Date(0), signal }, item.externalId);
        processed++;
        await save({ id: issue.id, payloadHash: issue.payloadHash });
      }
      if (processed < ids.length) throw new JobError("comic-issues-continue", `Обработано выпусков: ${processed}/${ids.length}.`, { deferSeconds: 1 });
    } catch (error) {
      signal.throwIfAborted();
      if (error instanceof JobError || (error instanceof Error && error.message === "STALE_SNAPSHOT_JOB")) throw error;
      const deferral = snapshotProviderDeferral(error, payload.mediaItemId);
      if (deferral) throw new JobError("provider-deferred", deferral.message, { deferSeconds: deferral.deferSeconds });
      const safe = snapshotItemError(payload.mediaItemId, error);
      const permanent = error instanceof Error && ["PROVIDER_SOURCE_CHANGED", "PROVIDER_SNAPSHOT_CHANGED", "INVALID_PROVIDER_SNAPSHOT_REFERENCES", "INCOMPLETE_COMIC_VINE_ISSUE_LIST"].includes(error.message);
      throw new JobError(safe.code, `Запись №${payload.mediaItemId}: ${snapshotItemErrorMessage(safe)}`, { retryable: !permanent });
    }
}

type ScheduleState = { issueAttempts?: number; afterId: number; completed: number; failed: number; errors: { id: number; code: string }[]; item?: ComicIssueItemPayload; retries?: number };
type SchedulePayload = { limit: number; mediaItemId?: number; checkpoint?: ScheduleState };
export function parseComicVineIssuesPayload(value: unknown): SchedulePayload {
  if (!value || typeof value !== "object" || Array.isArray(value)) throw new JobError("invalid-payload", "Ожидался объект параметров.", { retryable: false });
  const input = value as Record<string, unknown>;
  const integer = (value: unknown, min: number, max: number) => typeof value === "number" && Number.isSafeInteger(value) && value >= min && value <= max;
  if (input.limit !== undefined && !integer(input.limit, 1, 200)) throw new JobError("invalid-payload", "Лимит выпусков: от 1 до 200.", { retryable: false });
  if (input.mediaItemId !== undefined) parseComicVineIssueItemPayload({ mediaItemId: input.mediaItemId });
  const state = input.checkpoint as ScheduleState | undefined;
  if (state !== undefined) {
    if (!state || typeof state !== "object" || Array.isArray(state) || !integer(state.afterId, 0, 2147483647) || !integer(state.completed, 0, 2147483647) || !integer(state.failed, 0, 2147483647) || !Array.isArray(state.errors) || state.errors.length > 100 || state.errors.some(row => !row || !integer(row.id, 1, 2147483647) || typeof row.code !== "string") || (state.retries !== undefined && !integer(state.retries, 0, 3))) throw new JobError("invalid-payload", "Некорректный прогресс задачи.", { retryable: false });
    if (state.issueAttempts !== undefined && !integer(state.issueAttempts, 0, 200)) throw new JobError("invalid-payload", "Некорректный счётчик выпусков.", { retryable: false });
    if (state.item) parseComicVineIssueItemPayload(state.item);
  }
  return { limit: Number(input.limit ?? 25), ...(input.mediaItemId !== undefined ? { mediaItemId: Number(input.mediaItemId) } : {}), ...(state ? { checkpoint: state } : {}) };
}

export const comicVineIssuesJobHandler: import("@/lib/jobs/types").JobHandlerDefinition<SchedulePayload> = {
  type: COMIC_VINE_ISSUES_JOB_TYPE,
  label: "Авторы комиксов по всем выпускам Comic Vine",
  schedulable: true,
  defaultMaxAttempts: 3,
  defaultTimeoutSeconds: 300,
  parsePayload: parseComicVineIssuesPayload,
  async execute(context) {
    const { payload, runId, lockToken, signal } = context;
    if (!lockToken) throw new JobError("lease-lost", "Потеряна блокировка задачи.", { retryable: false });
    const guard = { runId, lockToken };
    let state: ScheduleState = payload.checkpoint ?? { afterId: 0, completed: 0, failed: 0, errors: [] };
    const finish = () => {
      if (state.failed) throw new JobError("comic-items-failed", `Сбор завершён: записей ${state.completed}, ошибок ${state.failed}. Первая ошибка: запись №${state.errors[0]?.id}, ${state.errors[0]?.code}.`, { retryable: false });
    };
    const save = async (markAttempt = false) => withSnapshotJobGuard(guard, async tx => {
      if (markAttempt && state.item) await tx.update(mediaItemMetadata)
        .set({ facts: sql`${mediaItemMetadata.facts} || ${JSON.stringify({ comicVineIssueLastAttemptAt: new Date().toISOString() })}::jsonb` })
        .where(and(eq(mediaItemMetadata.mediaItemId, state.item.mediaItemId), eq(mediaItemMetadata.sourceProvider, "comic-vine")));
      await tx.update(jobRuns).set({ payload: { ...payload, checkpoint: state }, updatedAt: new Date() }).where(eq(jobRuns.id, runId));
    });
    signal.throwIfAborted();
    if ((state.issueAttempts ?? 0) >= payload.limit) {
      if (state.failed) throw new JobError("comic-items-failed", `Сбор завершён: записей ${state.completed}, ошибок ${state.failed}. Первая ошибка: запись №${state.errors[0]?.id}, ${state.errors[0]?.code}.`, { retryable: false });
      return;
    }
    const [next] = state.item ? [{ id: state.item.mediaItemId }] : await getPendingComicVineItemsQuery({ afterId: state.afterId, limit: 1, mediaItemId: payload.mediaItemId });
    if (!next) {
      if (state.failed) throw new JobError("comic-items-failed", `Сбор завершён с ошибками: ${state.failed}. Первая ошибка: запись №${state.errors[0]?.id}, ${state.errors[0]?.code}.`, { retryable: false });
      return;
    }
    const item = state.item ?? { mediaItemId: next.id };
    state = { ...state, item };
    await save(!payload.checkpoint?.item);
    try {
      await runComicVineIssueItem({ ...context, payload: item }, current => {
        state = { ...state, item: current };
        return { ...payload, checkpoint: state };
      }, {
        remaining: payload.limit - (state.issueAttempts ?? 0),
        consume: async () => {
          if ((state.issueAttempts ?? 0) >= payload.limit) throw new JobError("comic-issue-budget", "Достигнут лимит выпусков за запуск.", { retryable: false });
          state = { ...state, issueAttempts: (state.issueAttempts ?? 0) + 1 };
          await save();
        },
      });
      state = { ...state, afterId: next.id, completed: state.completed + 1, item: undefined, retries: undefined };
      await save();
    } catch (error) {
      signal.throwIfAborted();
      if (!(error instanceof JobError) || error.code === "lease-lost") throw error;
      // A spent budget ends this scheduled run; the next run uses linked issue snapshots.
      if ((state.issueAttempts ?? 0) >= payload.limit) {
        if (error.code === "comic-issues-continue" || error.code === "comic-issue-budget") { finish(); return; }
        throw new JobError(error.code, error.message, { retryable: false });
      }
      if (error.deferSeconds !== null) throw error;
      if (["provider-disabled"].includes(error.code)) throw error;
      const retries = (state.retries ?? 0) + 1;
      // Reloaded item progress is stored by the per-issue transaction; don't overwrite it on retry.
      if (error.retryable && retries < 3) {
        await withSnapshotJobGuard(guard, async tx => {
          const [current] = await tx.select({ payload: jobRuns.payload }).from(jobRuns).where(eq(jobRuns.id, runId));
          const stored = parseComicVineIssuesPayload(current.payload);
          await tx.update(jobRuns).set({ payload: { ...stored, checkpoint: { ...stored.checkpoint!, retries } }, updatedAt: new Date() }).where(eq(jobRuns.id, runId));
        });
        throw new JobError("comic-item-retry", error.message, { deferSeconds: 60 * retries });
      }
      state = { ...state, afterId: next.id, failed: state.failed + 1, item: undefined, retries: undefined, errors: [...state.errors, { id: next.id, code: error.code }].slice(-100) };
      await save();
    }
    if ((state.issueAttempts ?? 0) >= payload.limit) { finish(); return; }
    throw new JobError("comic-records-continue", `Сбор авторов комиксов: завершено ${state.completed}, ошибок ${state.failed}.`, { deferSeconds: 1 });
  },
};
