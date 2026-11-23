import { creatorDatesOutOfOrder } from "./life-dates";
import { eq, sql } from "drizzle-orm";
import { db } from "@/db";
import type { DbTransaction } from "@/db/transaction";
import { creators, jobRuns } from "@/db/schema";
import {
  commitCreatorFields,
  creatorFieldsCandidates,
  readCreatorFieldsSnapshots,
  readCreatorFieldsState,
  type CreatorFieldsState,
} from "@/db/queries/creator-fields-fill";
import { getCoverProviderRateLimits } from "@/db/queries/cover-settings";
import { withSnapshotJobGuard, type SnapshotJobGuard } from "@/db/queries/provider-snapshots";
import { GameProviderDeferredError } from "@/lib/covers/game-provider-budget";
import { createProviderCoverSearchRateLimiter, wrapProviderSearchWithReserve } from "@/lib/covers/rate-limits";
import { COVER_PROVIDER_LABELS } from "@/lib/covers/provider-settings";
import { JobError, type JobHandlerDefinition } from "@/lib/jobs/types";
import { fetchCreatorProfileSnapshot } from "@/lib/providers/creator-profile-service";
import type { CreatorProfileTarget } from "@/lib/providers/creator-profile-targets";
import { diagnosticMessage, inspectSources, snapshotSources, type SnapshotMap } from "./fields-fill-preview";
import { snapshotItemError, snapshotItemErrorMessage } from "@/lib/providers/snapshot-item-errors";
import { getSnapshotBatchSettings } from "@/lib/providers/snapshot-job-payload";
import { snapshotHash } from "@/lib/providers/snapshot-values";
import { CREATOR_FIELDS_FILL_JOB_TYPE, CREATOR_FILL_FIELD_LABELS, parseCreatorFieldsFillPayload, type CreatorFillField, type CreatorFieldsFillPayload, type CreatorFieldsFillProgress } from "./fields-fill-payload";

function providerName(provider: string) {
  return COVER_PROVIDER_LABELS[provider as keyof typeof COVER_PROVIDER_LABELS] ?? provider;
}

function fieldsFor(state: CreatorFieldsState, fields: CreatorFillField[]) {
  return fields.filter(field => field === "foundedDate"
    ? state.typeCode === "organization" && state.birthDate === null
    : state.typeCode === "person" && !state.isPseudonym && state[field] === null);
}

function selectBindings(state: CreatorFieldsState, providers: CreatorFieldsFillPayload["providers"]) {
  return providers ? { ...state, bindings: state.bindings.filter(binding => providers.some(provider => provider === binding.provider)) } : state;
}

function fingerprint(state: CreatorFieldsState, snapshots: SnapshotMap) {
  const hasComicVine = state.bindings.some(binding => binding.provider === "comic-vine");
  const hasFantlab = state.bindings.some(binding => binding.provider === "fantlab");
  const version = hasComicVine ? 4 : hasFantlab ? 3 : 2;
  return snapshotHash([version, state.typeCode, state.isPseudonym, ...state.bindings.map(binding => [
    binding.id, binding.provider, binding.externalCreatorId,
    snapshots.get(binding.id)?.payloadHash ?? null, snapshots.get(-binding.id)?.payloadHash ?? null,
  ])]);
}

type CreatorFieldsResult = {
  checked?: boolean;
  filled?: number;
  missing?: boolean;
  review?: boolean;
  failed?: boolean;
  messages?: string[];
  reviewMessages?: string[];
};

function resolveFields(state: CreatorFieldsState | null, snapshots: SnapshotMap, payload: CreatorFieldsFillPayload) {
  if (!state) return { result: { checked: true, messages: ["Создатель не найден."] } };
  const requested = fieldsFor(state, payload.fields);
  if (!requested.length) return { result: payload.force ? { checked: true, messages: ["Нет полей для автоматического заполнения."] } : {} };
  const inspected = inspectSources(state, snapshots);
  const missing = inspected.some(row => row.needsSnapshot);
  const version = fingerprint(state, snapshots);
  const fields = requested.filter(field => payload.force || missing || state.attempts[field] !== version);

  const reviewMessages = inspected.flatMap(source => {
    const label = providerName(source.provider);
    if (source.invalid) return [`${label}: не удалось разобрать сохранённый профиль.`];
    return (source.projection?.diagnostics ?? []).map(code => `${label}: ${diagnosticMessage(code)}`);
  });
  const sourceMessages = inspected.flatMap(source => {
    const label = providerName(source.provider);
    if (!source.target) return [`${label}: для этого профиля заполнение не поддерживается.`];
    return source.needsSnapshot ? [`${label}: нужен снимок с датами.`] : [];
  });
  if (!inspected.length) sourceMessages.push("Нет подтверждённых привязок.");

  const changes: { birthDate?: string; deathDate?: string } = {};
  for (const field of requested) {
    const column = field === "foundedDate" ? "birthDate" : field;
    const values = inspected.flatMap(source => {
      const value = source.projection?.[column];
      return value ? [{ value, provider: providerName(source.provider) }] : [];
    });
    const distinct = new Set(values.map(row => row.value));
    const exact = [...distinct].filter(value => value.length > 4);
    const compatible = new Set(values.map(({ value }) => value.slice(0, 4))).size <= 1 && exact.length <= 1;
    if (!compatible) {
      reviewMessages.push(`${CREATOR_FILL_FIELD_LABELS[field]}: ${values.map(({ provider, value }) => `${provider} — ${value}`).join(", ")}.`);
    } else if (values[0]) {
      changes[column] = exact[0] ?? values[0].value;
    }
  }
  const start = state.birthDate ?? changes.birthDate;
  const end = state.deathDate ?? changes.deathDate;
  if (creatorDatesOutOfOrder(start, end)) {
    delete changes.birthDate;
    delete changes.deathDate;
    reviewMessages.push("Начальная дата позже конечной. Требуется ручная проверка.");
  }
  const review = reviewMessages.length > 0;
  if (!fields.length) return { result: review ? { checked: true, review, reviewMessages, messages: reviewMessages } : {} };
  if (!fields.includes(state.typeCode === "organization" ? "foundedDate" : "birthDate")) delete changes.birthDate;
  if (!fields.includes("deathDate")) delete changes.deathDate;
  const messages = [...reviewMessages, ...sourceMessages];
  const filled = Object.keys(changes).length;
  if (filled) {
    for (const field of fields) {
      const value = changes[field === "foundedDate" ? "birthDate" : field];
      if (value) messages.push(`${CREATOR_FILL_FIELD_LABELS[field]}: заполнено ${value}.`);
    }
  } else if (!messages.length) {
    messages.push("В снимках нет новых дат.");
  }
  const attempts = Object.fromEntries(fields.map(field => [field, version]));
  const snapshotRefs = inspected.flatMap(({ snapshot, invalid }) =>
    snapshot && !invalid ? [{ id: snapshot.id, payloadHash: snapshot.payloadHash }] : []);
  return { changes, attempts, snapshotRefs, result: { checked: true, filled, missing, review, reviewMessages, messages } };
}

function nextProgress(progress: CreatorFieldsFillProgress, creatorId: number, result: CreatorFieldsResult) {
  const messages = result.messages?.slice(0, 20).map(message => message.slice(0, 1000));
  const problemMessages = result.failed ? messages : result.reviewMessages?.slice(0, 20).map(message => message.slice(0, 1000));
  return {
    ...progress,
    afterId: creatorId,
    scanned: (progress.scanned ?? 0) + 1,
    processed: progress.processed + Number(Boolean(result.checked)),
    updated: progress.updated + Number(Boolean(result.filled)),
    filled: progress.filled + (result.filled ?? 0),
    missing: progress.missing + Number(Boolean(result.missing)),
    review: progress.review + Number(Boolean(result.review)),
    failed: progress.failed + Number(Boolean(result.failed)),
    details: messages?.length ? [...progress.details, { creatorId, messages }].slice(-100) : progress.details,
    ...(problemMessages?.length ? { problems: [...(progress.problems ?? []), { creatorId, messages: problemMessages }] } : {}),
  };
}

async function beforeProfileRequest() {
  const limits = await getCoverProviderRateLimits();
  const limiter = createProviderCoverSearchRateLimiter(limits);
  const reserve = wrapProviderSearchWithReserve(limiter.canSearchProvider, limits, 100);
  return async (provider: CreatorProfileTarget["provider"]) => {
    if (typeof await reserve(provider) === "string") {
      throw new JobError("provider-deferred", "Ожидание доступного лимита провайдера.", { deferSeconds: 60 });
    }
  };
}

async function fetchMissingSnapshots(state: CreatorFieldsState, snapshots: SnapshotMap, guard: SnapshotJobGuard, signal: AbortSignal, beforeRequest: Awaited<ReturnType<typeof beforeProfileRequest>>) {
  const errors: string[] = [];
  for (const source of inspectSources(state, snapshots)) {
    if (!source.target || !source.needsSnapshot) continue;
    signal.throwIfAborted();
    try {
      await fetchCreatorProfileSnapshot(source.target, { includeDates: true, onlyMissing: true, signal, jobGuard: guard, beforeRequest });
    } catch (error) {
      signal.throwIfAborted();
      if (error instanceof JobError) throw error;
      if (error instanceof GameProviderDeferredError) throw new JobError(error.code, "Ожидание доступного лимита провайдера.", { deferSeconds: error.retryAfterSeconds });
      const diagnostic = snapshotItemError(state.id, error);
      if (diagnostic.code === "provider-http-429") {
        const retryAfter = error && typeof error === "object" && "retryAfterSeconds" in error ? Number(error.retryAfterSeconds) : 60;
        throw new JobError("provider-deferred", "Провайдер ограничил частоту запросов.", { deferSeconds: Math.max(1, retryAfter || 60) });
      }
      errors.push(`${providerName(source.provider)}: ${snapshotItemErrorMessage(diagnostic)}`);
    }
  }
  return errors;
}

export const creatorFieldsFillHandler: JobHandlerDefinition<CreatorFieldsFillPayload> = {
  type: CREATOR_FIELDS_FILL_JOB_TYPE,
  label: "Заполнение данных создателей из снимков",
  schedulable: false,
  defaultTimeoutSeconds: 900,
  parsePayload: parseCreatorFieldsFillPayload,
  async execute({ payload, runId, lockToken, signal }) {
    if (!lockToken) throw new JobError("lease-lost", "Запуск потерял право выполнения.", { retryable: false });
    const guard = { runId, lockToken };
    const [max] = payload.progress || payload.creatorIds ? [] : await db.select({ id: sql<number>`coalesce(max(${creators.id}), 0)::int` }).from(creators);
    let progress: CreatorFieldsFillProgress = payload.progress ?? {
      afterId: 0, throughId: payload.creatorIds ? Math.max(...payload.creatorIds) : max.id,
      processed: 0, updated: 0, filled: 0, missing: 0, review: 0, failed: 0, details: [],
    };
    const write = async (tx: DbTransaction, next: CreatorFieldsFillProgress) => {
      signal.throwIfAborted();
      await tx.update(jobRuns).set({ payload: { ...payload, progress: next }, updatedAt: new Date() }).where(eq(jobRuns.id, runId));
    };
    if (!payload.progress) await withSnapshotJobGuard(guard, tx => write(tx, progress));
    const { remaining, pauseSeconds } = getSnapshotBatchSettings(payload, progress.scanned ?? 0);
    const ids = payload.force && payload.creatorIds
      ? payload.creatorIds.filter(id => id > progress.afterId)
      : await creatorFieldsCandidates({ ...progress, creatorIds: payload.creatorIds, providers: payload.providers, fields: payload.fields, limit: remaining + 1 });
    const beforeRequest = payload.fetchMissing && ids.length ? await beforeProfileRequest() : undefined;

    for (const creatorId of ids.slice(0, remaining)) {
      signal.throwIfAborted();
      const state = beforeRequest ? await readCreatorFieldsState(creatorId) : null;
      const current = state ? selectBindings(state, payload.providers) : null;
      if (current && fieldsFor(current, payload.fields).length && beforeRequest) {
        const previous = await readCreatorFieldsSnapshots(snapshotSources(current));
        const errors = await fetchMissingSnapshots(current, previous, guard, signal, beforeRequest);
        if (errors.length) {
          const next = nextProgress(progress, creatorId, { checked: true, failed: true, missing: true, messages: errors });
          await withSnapshotJobGuard(guard, tx => write(tx, next));
          progress = next;
          continue;
        }
      }

      progress = await commitCreatorFields({
        creatorId, guard, snapshots: state => snapshotSources(selectBindings(state, payload.providers)),
        resolve(currentState, snapshots) {
          const state = currentState ? selectBindings(currentState, payload.providers) : null;
          const { result, ...planned } = resolveFields(state, snapshots, payload);
          if (payload.fetchMissing && state && fieldsFor(state, payload.fields).length
            && inspectSources(state, snapshots).some(source => source.needsSnapshot)) {
            throw new JobError("creator-fields-source-changed", "Источник изменился, потребуется повторная проверка.", { deferSeconds: 1 });
          }
          return { ...planned, result: nextProgress(progress, creatorId, result) };
        },
        saveProgress: write,
      });
    }
    if (ids.length > remaining) throw new JobError("creator-fields-continue", "Следующая партия создателей.", { deferSeconds: pauseSeconds });
    if (progress.failed) throw new JobError("creator-fields-incomplete", `Не удалось обработать создателей: ${progress.failed}.`, { retryable: false });
  },
};
