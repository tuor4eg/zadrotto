import { parseCreatorProfileTarget, type CreatorProfileTarget } from "./creator-profile-targets";
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
  mediaType?: "book" | "film" | "series" | "anime" | "game" | "boardgame" | "comic" | "roblox";
  creatorIds?: number[];
  bindingIds?: number[];
  profileTargets?: CreatorProfileTarget[];
  profileCheckpoint?: {
    afterBindingId: number; throughBindingId: number; nextTargetIndex: number; processed: number; failed: number;
    retryCount?: number;
    errors: (SnapshotItemError & { target?: CreatorProfileTarget; creatorId?: number; bindingId?: number })[];
  };
  onlyMissingSnapshots?: boolean;
  applyGameChanges?: boolean;
  applyBoardgameChanges?: boolean;
  operation: SnapshotOperation;
  provider?: BookProviderCode | "tmdb" | "igdb" | "rawg" | "anilist" | "bgg" | "comic-vine" | "roblox";
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
  if (Object.keys(input).some(key=>!["applyBoardgameChanges","applyGameChanges","mediaType","entityType","creatorIds","bindingIds","profileTargets","profileCheckpoint","onlyMissingSnapshots","operation","provider","mediaItemIds","batchSize","batchPauseHours","afterId","throughId","checkpoint"].includes(key)) || !SNAPSHOT_OPERATIONS.includes(input.operation as SnapshotOperation)) throw new Error("INVALID_SNAPSHOT_JOB");
  if (input.applyBoardgameChanges !== undefined && (typeof input.applyBoardgameChanges !== "boolean" || input.mediaType !== "boardgame" || input.entityType === "creator" || input.profileTargets !== undefined || !["process", "refresh-process"].includes(String(input.operation)))) throw new Error("INVALID_BOARDGAME_CHANGE_OPTION");
  if (input.applyGameChanges !== undefined && (typeof input.applyGameChanges !== "boolean" || input.mediaType !== "game" || input.entityType === "creator" || input.profileTargets !== undefined || !["process", "refresh-process"].includes(String(input.operation)))) throw new Error("INVALID_GAME_CHANGE_OPTION");
  if (input.onlyMissingSnapshots !== undefined && (typeof input.onlyMissingSnapshots !== "boolean" || (input.onlyMissingSnapshots && !["refresh","refresh-process"].includes(String(input.operation))))) throw new Error("INVALID_MISSING_SNAPSHOT_FILTER");
  if (input.entityType !== undefined && input.entityType !== "media-item" && input.entityType !== "creator") throw new Error("INVALID_SNAPSHOT_ENTITY_TYPE");
  if (input.mediaType !== undefined && (!["book", "film", "series", "anime", "game", "boardgame", "comic", "roblox"].includes(String(input.mediaType)) || input.entityType === "creator" || input.profileTargets !== undefined
    || (["film", "series"].includes(String(input.mediaType)) && input.provider !== undefined && input.provider !== "tmdb")
    || (input.mediaType === "anime" && input.provider !== undefined && input.provider !== "anilist")
    || (input.mediaType === "book" && input.provider !== undefined && !["fantlab", "google-books", "open-library"].includes(String(input.provider)))
    || (input.mediaType === "comic" && input.provider !== undefined && input.provider !== "comic-vine")
    || (input.mediaType === "roblox" && input.provider !== undefined && input.provider !== "roblox")
    || (input.mediaType === "boardgame" && input.provider !== undefined && input.provider !== "bgg")
    || (input.mediaType === "game" && input.provider !== undefined && !["igdb", "rawg"].includes(String(input.provider))))) throw new Error("INVALID_SNAPSHOT_MEDIA_TYPE");
  if (input.provider === "comic-vine" && input.entityType !== "creator" && input.mediaType !== "comic") throw new Error("INVALID_SNAPSHOT_PROVIDER");
  if (input.provider === "roblox" && input.entityType !== "creator" && input.mediaType !== "roblox") throw new Error("INVALID_SNAPSHOT_PROVIDER");
  if (input.provider === "bgg" && input.mediaType !== "boardgame") throw new Error("INVALID_SNAPSHOT_PROVIDER");
  if (input.provider === "anilist" && (input.entityType === "creator" ? input.operation !== "refresh" : input.mediaType !== "anime" || input.profileTargets !== undefined)) throw new Error("INVALID_SNAPSHOT_PROVIDER");
  const profiles = input.profileTargets !== undefined;
  if (profiles) {
    if (!Array.isArray(input.profileTargets) || !input.profileTargets.length || input.profileTargets.length > 200 || input.operation !== "refresh"
      || input.entityType !== undefined || input.creatorIds !== undefined || input.bindingIds !== undefined || input.mediaItemIds !== undefined || input.provider !== undefined
      || input.checkpoint !== undefined || input.afterId !== undefined || input.throughId !== undefined) throw new Error("INVALID_CREATOR_PROFILE_JOB");
    input.profileTargets.forEach(parseCreatorProfileTarget);
  }
  if (input.entityType === "creator") {
    if (input.operation === "verify" || input.mediaItemIds !== undefined || (input.provider !== undefined && !["fantlab", "tmdb", "igdb", "rawg", "anilist", "comic-vine", "roblox"].includes(String(input.provider)))
      || (input.operation !== "refresh" && (!["fantlab", "tmdb"].includes(String(input.provider)) || input.bindingIds !== undefined))) throw new Error("INVALID_CREATOR_SNAPSHOT_JOB");
  } else if (input.creatorIds !== undefined || input.bindingIds !== undefined) throw new Error("INVALID_CREATOR_SNAPSHOT_JOB");
  if (input.bindingIds !== undefined && (!Array.isArray(input.bindingIds) || !input.bindingIds.length || input.bindingIds.length > 200 || !input.bindingIds.every(id => Number.isSafeInteger(id) && id > 0))) throw new Error("INVALID_SNAPSHOT_IDS");
  if (!profiles && input.entityType !== "creator" && input.mediaType !== "game" && ["igdb", "rawg"].includes(String(input.provider))) throw new Error("INVALID_SNAPSHOT_PROVIDER");
  if (input.profileCheckpoint !== undefined) {
    const cp = input.profileCheckpoint as SnapshotJobPayload["profileCheckpoint"];
    if ((!profiles && input.entityType !== "creator") || input.operation !== "refresh" || input.checkpoint !== undefined || !cp
      || ![cp.afterBindingId, cp.throughBindingId, cp.nextTargetIndex, cp.processed, cp.failed].every(n => Number.isSafeInteger(n) && n >= 0)
      || (cp.retryCount !== undefined && (!Number.isSafeInteger(cp.retryCount) || cp.retryCount < 0))
      || (profiles && cp.nextTargetIndex > (input.profileTargets as unknown[]).length)
      || !Array.isArray(cp.errors) || cp.errors.length > 100 || cp.errors.some(row => !Number.isSafeInteger(row.id) || row.id < 0 || typeof row.code !== "string"
        || [row.creatorId, row.bindingId].some(id => id !== undefined && (!Number.isSafeInteger(id) || id < 1)))) throw new Error("INVALID_SNAPSHOT_CHECKPOINT");
    cp.errors.forEach(row => { if (row.target) parseCreatorProfileTarget(row.target); });
  }
  if (input.creatorIds !== undefined && (!Array.isArray(input.creatorIds) || !input.creatorIds.length || input.creatorIds.length > 200 || !input.creatorIds.every(id => Number.isSafeInteger(id) && id > 0))) throw new Error("INVALID_SNAPSHOT_IDS");
  if (input.provider!==undefined && (typeof input.provider!=="string" || !["fantlab","google-books","open-library","tmdb","igdb","rawg","anilist","bgg","comic-vine","roblox"].includes(input.provider))) throw new Error("INVALID_SNAPSHOT_PROVIDER");
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
