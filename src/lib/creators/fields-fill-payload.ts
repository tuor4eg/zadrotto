import { JobError } from "@/lib/jobs/types";
import { SNAPSHOT_MAX_BATCH_SIZE, SNAPSHOT_MAX_PAUSE_HOURS } from "@/lib/providers/snapshot-job-payload";

import { CREATOR_FIELDS_FILL_RESOURCES } from "@/lib/providers/creator-profile-targets";

export const CREATOR_FIELDS_FILL_JOB_TYPE = "media.creator-fields-fill";
export type CreatorFieldsFillProvider = keyof typeof CREATOR_FIELDS_FILL_RESOURCES;
export const CREATOR_FIELDS_FILL_PROVIDERS = Object.keys(CREATOR_FIELDS_FILL_RESOURCES) as CreatorFieldsFillProvider[];
export function isCreatorFieldsFillProvider(value: unknown): value is CreatorFieldsFillProvider {
  return CREATOR_FIELDS_FILL_PROVIDERS.some(provider => provider === value);
}

export const CREATOR_FILL_FIELDS = ["birthDate", "deathDate", "foundedDate"] as const;
export type CreatorFillField = typeof CREATOR_FILL_FIELDS[number];
export const CREATOR_FILL_FIELD_LABELS: Record<CreatorFillField, string> = {
  birthDate: "Дата рождения",
  deathDate: "Дата смерти",
  foundedDate: "Дата основания",
};

export type CreatorFieldsFillProgress = {
  afterId: number;
  throughId: number;
  scanned?: number;
  processed: number;
  updated: number;
  filled: number;
  missing: number;
  review: number;
  failed: number;
  details: { creatorId: number; messages: string[] }[];
};

export type CreatorFieldsFillPayload = {
  creatorIds?: number[];
  providers?: CreatorFieldsFillProvider[];
  fields: CreatorFillField[];
  fetchMissing: boolean;
  force: boolean;
  batchSize?: number;
  batchPauseHours?: number;
  progress?: CreatorFieldsFillProgress;
};

const isCount = (value: unknown): value is number =>
  typeof value === "number" && Number.isSafeInteger(value) && value >= 0 && value <= 2147483647;

export function parseCreatorFieldsFillPayload(value: unknown): CreatorFieldsFillPayload {
  const invalid = () => new JobError("invalid-payload", "Некорректные параметры заполнения данных создателей.", { retryable: false });
  if (!value || typeof value !== "object" || Array.isArray(value)) throw invalid();
  const payload = value as Partial<CreatorFieldsFillPayload>;
  if (!Array.isArray(payload.fields) || !payload.fields.length || payload.fields.length > CREATOR_FILL_FIELDS.length
    || !payload.fields.every(field => CREATOR_FILL_FIELDS.includes(field))
    || typeof payload.fetchMissing !== "boolean" || typeof payload.force !== "boolean") throw invalid();
  if (payload.creatorIds !== undefined && (!Array.isArray(payload.creatorIds) || !payload.creatorIds.length || payload.creatorIds.length > 200
    || !payload.creatorIds.every(id => isCount(id) && id > 0))) throw invalid();
  if (payload.force && payload.creatorIds?.length !== 1) throw invalid();
  if (payload.providers !== undefined && (!Array.isArray(payload.providers) || !payload.providers.length
    || payload.providers.length > CREATOR_FIELDS_FILL_PROVIDERS.length || !payload.providers.every(isCreatorFieldsFillProvider))) throw invalid();

  if (payload.batchSize !== undefined && (!isCount(payload.batchSize) || payload.batchSize < 1 || payload.batchSize > SNAPSHOT_MAX_BATCH_SIZE)) throw invalid();
  if (payload.batchPauseHours !== undefined && (typeof payload.batchPauseHours !== "number"
    || !Number.isFinite(payload.batchPauseHours) || payload.batchPauseHours < 0 || payload.batchPauseHours > SNAPSHOT_MAX_PAUSE_HOURS)) throw invalid();

  const progress = payload.progress;
  if (progress !== undefined && (!progress || typeof progress !== "object"
    || ![progress.afterId, progress.throughId, progress.processed, progress.updated, progress.filled, progress.missing, progress.review, progress.failed].every(isCount)
    || (progress.scanned !== undefined && !isCount(progress.scanned))
    || progress.afterId > progress.throughId || !Array.isArray(progress.details) || progress.details.length > 100
    || !progress.details.every(row => row && isCount(row.creatorId) && row.creatorId > 0 && Array.isArray(row.messages)
      && row.messages.length <= 20 && row.messages.every(message => typeof message === "string" && message.length <= 1000)))) throw invalid();

  return {
    ...(payload.creatorIds ? { creatorIds: [...new Set(payload.creatorIds)] } : {}),
    ...(payload.providers ? { providers: [...new Set(payload.providers)] } : {}),
    fields: [...new Set(payload.fields)],
    fetchMissing: payload.fetchMissing,
    force: payload.force,
    ...(payload.batchSize !== undefined ? { batchSize: payload.batchSize } : {}),
    ...(payload.batchPauseHours !== undefined ? { batchPauseHours: payload.batchPauseHours } : {}),
    ...(progress ? { progress } : {}),
  };
}
