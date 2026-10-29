import { creatorProfileTargetFromBinding } from "@/lib/providers/creator-profile-targets";
import type { CreatorProfileTarget } from "@/lib/providers/creator-profile-targets";

export const CREATOR_IMAGE_KINDS = [
  { type: "person", provider: "roblox", resourceType: "user", prefix: "user:" },
  { type: "organization", provider: "roblox", resourceType: "group", prefix: "group:" },
  { type: "person", provider: "comic-vine", resourceType: "person", prefix: "person:" },
  { type: "organization", provider: "comic-vine", resourceType: "publisher", prefix: "publisher:" },
  { type: "person", provider: "fantlab", resourceType: "author", prefix: "" },
  { type: "person", provider: "anilist", resourceType: "person", prefix: "person:" },
  { type: "person", provider: "tmdb", resourceType: "person", prefix: "person:" },
  { type: "organization", provider: "tmdb", resourceType: "company", prefix: "company:" },
  { type: "organization", provider: "tmdb", resourceType: "network", prefix: "network:" },
  { type: "organization", provider: "igdb", resourceType: "company", prefix: "company:" },
] as const;
export type ImageBinding = { id: number; provider: string; externalCreatorId: string };
export function creatorImageCandidates(type: string, bindings: ImageBinding[]) {
  return CREATOR_IMAGE_KINDS.filter(kind => kind.type === type).map(kind => {
    const matches = bindings.filter(binding => {
      const target = creatorProfileTargetFromBinding(binding);
      return target?.provider === kind.provider && target.resourceType === kind.resourceType;
    });
    return { kind, bindings: matches, target: matches.length === 1 ? creatorProfileTargetFromBinding(matches[0]) as CreatorProfileTarget : null };
  });
}
export type CreatorImageOutcome = "stored" | "already-present" | "no-binding" | "unsupported-source" | "missing-image" | "ambiguous-binding" | "source-changed";
export type CreatorImageCheckpoint = { afterId: number; throughId: number; total: number; processed: number; failed: number; storedImages: number; missingImages: number; skipped: number; retryCount?: number; errors: { creatorId: number; code: string }[] };
export type CreatorImagesPayload = { creatorTypeId?: number; roleId?: number; batchSize: number; checkpoint?: CreatorImageCheckpoint };
const integer = (n: unknown, min = 1): n is number => Number.isSafeInteger(n) && Number(n) >= min && Number(n) <= 2147483647;
export function parseCreatorImagesPayload(value: unknown): CreatorImagesPayload {
  if (!value || typeof value !== "object" || Array.isArray(value)) throw new Error("INVALID_CREATOR_IMAGES_PAYLOAD");
  const row = value as Record<string, unknown>;
  if (Object.keys(row).some(key => !["creatorTypeId", "roleId", "batchSize", "checkpoint"].includes(key))) throw new Error("INVALID_CREATOR_IMAGES_PAYLOAD");
  for (const key of ["creatorTypeId", "roleId"] as const) if (row[key] !== undefined && !integer(row[key])) throw new Error("INVALID_CREATOR_IMAGE_FILTER");
  const batchSize = row.batchSize ?? 25;
  if (!integer(batchSize) || batchSize > 100) throw new Error("INVALID_BATCH_SIZE");
  const cp = row.checkpoint as CreatorImageCheckpoint | undefined;
  if (cp !== undefined && (!cp || typeof cp !== "object" || Array.isArray(cp)
    || [cp.afterId, cp.throughId, cp.total, cp.processed, cp.failed, cp.storedImages, cp.missingImages, cp.skipped].some(n => !integer(n, 0))
    || cp.afterId > cp.throughId || (cp.retryCount !== undefined && (!integer(cp.retryCount, 0) || cp.retryCount > 3))
    || !Array.isArray(cp.errors) || cp.errors.length > 100 || cp.errors.some(e => !e || !integer(e.creatorId) || typeof e.code !== "string" || e.code.length > 100))) throw new Error("INVALID_CREATOR_IMAGE_CHECKPOINT");
  return { batchSize, ...(row.creatorTypeId !== undefined ? { creatorTypeId: row.creatorTypeId as number } : {}), ...(row.roleId !== undefined ? { roleId: row.roleId as number } : {}), ...(cp ? { checkpoint: cp } : {}) };
}
export function parseCreatorImageFillPayload(value: unknown) {
  if (!value || typeof value !== "object" || Array.isArray(value)) throw new Error("INVALID_CREATOR_IMAGE_PAYLOAD");
  const row = value as Record<string, unknown>;
  if (!integer(row.creatorId) || Object.keys(row).some(key => !["creatorId", "bindingFingerprint", "refreshCompanySearch", "outcome"].includes(key))
    || (row.refreshCompanySearch !== undefined && typeof row.refreshCompanySearch !== "boolean")
    || (row.bindingFingerprint !== undefined && (typeof row.bindingFingerprint !== "string" || !/^[a-f0-9]{64}$/.test(row.bindingFingerprint)))) throw new Error("INVALID_CREATOR_IMAGE_PAYLOAD");
  return { creatorId: row.creatorId, ...(row.refreshCompanySearch === true ? {refreshCompanySearch: true} : {}), ...(row.bindingFingerprint ? { bindingFingerprint: row.bindingFingerprint as string } : {}) };
}

/** Explicit refresh never takes ownership of a manual or another identity's image. */
export function canWriteCreatorImage(creator: { avatarObjectKey: string | null; avatarSource: string | null; avatarSourceExternalId?: string | null }, binding?: ImageBinding) {
  if (!creator.avatarObjectKey && !creator.avatarSource) return true;
  return Boolean(binding && creator.avatarSource === binding.provider && creator.avatarSourceExternalId === binding.externalCreatorId);
}
export function parseCreatorImageRefreshPayload(value: unknown) {
  if (!value || typeof value !== "object" || Array.isArray(value)) throw new Error("INVALID_CREATOR_IMAGE_PAYLOAD");
  const row = value as Record<string, unknown>;
  if (!integer(row.creatorId) || !integer(row.bindingId) || Object.keys(row).some(key => !["creatorId", "bindingId", "outcome"].includes(key))) throw new Error("INVALID_CREATOR_IMAGE_PAYLOAD");
  return { creatorId: row.creatorId, bindingId: row.bindingId };
}
