import type { SnapshotItemError } from "./snapshot-item-errors";
import type {BookProviderCode} from "./types";

export const PROVIDER_SNAPSHOT_JOB_TYPE = "provider.snapshots";
export const SNAPSHOT_OPERATIONS = ["refresh", "process", "refresh-process", "verify"] as const;
export const SNAPSHOT_DEFAULT_BATCH_SIZE = 25;
export const SNAPSHOT_MAX_BATCH_SIZE = 100;
export const SNAPSHOT_MAX_PAUSE_HOURS = 8760;
export type SnapshotOperation = typeof SNAPSHOT_OPERATIONS[number];
export type SnapshotJobPayload = {
  entityType?: "media-item" | "creator";
  creatorIds?: number[];
  onlyMissingSnapshots?: boolean;
  operation: SnapshotOperation;
  provider?: BookProviderCode;
  mediaItemIds?: number[];
  batchSize?: number;
  batchPauseHours?: number;
  afterId?: number;
  throughId?: number;
  checkpoint?: {afterId:number;throughId:number;processed:number;failed:number;retryId?:number;retryCount?:number;errors:SnapshotItemError[];diagnostics?:{id:number;codes:string[]}[]};
};
export function parseSnapshotJobPayload(value: unknown): SnapshotJobPayload {
  if (!value || typeof value!=="object" || Array.isArray(value)) throw new Error("INVALID_SNAPSHOT_JOB");
  const input=value as Record<string,unknown>;
  if (Object.keys(input).some(key=>!["entityType","creatorIds","onlyMissingSnapshots","operation","provider","mediaItemIds","batchSize","batchPauseHours","afterId","throughId","checkpoint"].includes(key)) || !SNAPSHOT_OPERATIONS.includes(input.operation as SnapshotOperation)) throw new Error("INVALID_SNAPSHOT_JOB");
  if (input.onlyMissingSnapshots !== undefined && (input.entityType !== "creator" || typeof input.onlyMissingSnapshots !== "boolean" || (input.onlyMissingSnapshots && input.operation === "process"))) throw new Error("INVALID_MISSING_SNAPSHOT_FILTER");
  if (input.entityType !== undefined && input.entityType !== "media-item" && input.entityType !== "creator") throw new Error("INVALID_SNAPSHOT_ENTITY_TYPE");
  if (input.entityType === "creator") {
    if (input.provider !== "fantlab" || input.operation === "verify" || input.mediaItemIds !== undefined) throw new Error("INVALID_CREATOR_SNAPSHOT_JOB");
  } else if (input.creatorIds !== undefined) throw new Error("INVALID_CREATOR_SNAPSHOT_JOB");
  if (input.creatorIds !== undefined && (!Array.isArray(input.creatorIds) || !input.creatorIds.length || input.creatorIds.length > 200 || !input.creatorIds.every(id => Number.isSafeInteger(id) && id > 0))) throw new Error("INVALID_SNAPSHOT_IDS");
  if (input.provider!==undefined && (typeof input.provider!=="string" || !["fantlab","google-books","open-library"].includes(input.provider))) throw new Error("INVALID_SNAPSHOT_PROVIDER");
  if (input.batchSize!==undefined && (!Number.isSafeInteger(input.batchSize) || Number(input.batchSize)<1 || Number(input.batchSize)>SNAPSHOT_MAX_BATCH_SIZE)) throw new Error("INVALID_SNAPSHOT_BATCH_SIZE");
  if (input.batchPauseHours!==undefined && (typeof input.batchPauseHours!=="number" || !Number.isFinite(input.batchPauseHours) || input.batchPauseHours<0 || input.batchPauseHours>SNAPSHOT_MAX_PAUSE_HOURS)) throw new Error("INVALID_SNAPSHOT_BATCH_PAUSE");
  for (const key of ["afterId","throughId"]) if (input[key]!==undefined && (!Number.isSafeInteger(input[key]) || Number(input[key])<0)) throw new Error("INVALID_SNAPSHOT_RANGE");
  if (input.mediaItemIds!==undefined && (!Array.isArray(input.mediaItemIds) || !input.mediaItemIds.length || input.mediaItemIds.length>200 || !input.mediaItemIds.every(id=>Number.isSafeInteger(id)&&id>0))) throw new Error("INVALID_SNAPSHOT_IDS");
  if (input.checkpoint!==undefined) {
    const cp=input.checkpoint as SnapshotJobPayload["checkpoint"];
    if (!cp || ![cp.afterId,cp.throughId,cp.processed,cp.failed].every(n=>Number.isSafeInteger(n)&&n>=0) || !Array.isArray(cp.errors) || cp.errors.length>100 || cp.errors.some(row=>!Number.isSafeInteger(row.id)||typeof row.code!=="string" || (row.targetExternalId!==undefined && (typeof row.targetExternalId!=="string" || !/^\/works\/OL[1-9]\d*W$/.test(row.targetExternalId))))
      || (cp.retryId!==undefined && (!Number.isSafeInteger(cp.retryId)||cp.retryId<1)) || (cp.retryCount!==undefined && (!Number.isSafeInteger(cp.retryCount)||cp.retryCount<0))) throw new Error("INVALID_SNAPSHOT_CHECKPOINT");
    if (cp.diagnostics !== undefined && (!Array.isArray(cp.diagnostics) || cp.diagnostics.length > 100 || cp.diagnostics.some(row => !Number.isSafeInteger(row.id) || row.id < 1 || !Array.isArray(row.codes) || row.codes.length > 10 || row.codes.some(code => typeof code !== "string" || code.length > 100)))) throw new Error("INVALID_SNAPSHOT_CHECKPOINT");
  }
  return input as SnapshotJobPayload;
}

export function getSnapshotBatchSettings(payload: SnapshotJobPayload) {
  const batchSize = payload.batchSize ?? SNAPSHOT_DEFAULT_BATCH_SIZE;
  const batchPauseHours = payload.batchPauseHours ?? 0;
  const completed = (payload.checkpoint?.processed ?? 0) + (payload.checkpoint?.failed ?? 0);
  return { batchSize, batchPauseHours, pauseSeconds: Math.max(1, Math.ceil(batchPauseHours * 3600)), remaining: batchSize - completed % batchSize };
}
