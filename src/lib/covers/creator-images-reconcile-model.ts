import { JobError } from "@/lib/jobs/types";

export const CREATOR_IMAGES_RECONCILE_JOB_TYPE = "media.creator-images-reconcile";
export type CreatorImagesReconcileCounters = { checked: number; healthy: number; missing: number; restored: number; skipped: number; failed: number };
export type CreatorImagesReconcileCheckpoint = {
  phase?: "creators" | "platforms"; throughPlatformId?: number;
  afterId: number; throughId: number; counters: CreatorImagesReconcileCounters;
  current?: { id: number; retryCount: number };
  errors: ({ creatorId: number; code: string } | { platformId: number; code: string })[];
};
export type CreatorImagesReconcilePayload = {
  mode: "audit" | "repair"; batchSize: number; scope?: "all" | "creators" | "platforms"; creatorId?: number; platformId?: number; checkpoint?: CreatorImagesReconcileCheckpoint;
};
export const emptyCreatorImagesReconcileCounters = (): CreatorImagesReconcileCounters => ({ checked: 0, healthy: 0, missing: 0, restored: 0, skipped: 0, failed: 0 });
const integer = (n: unknown, min = 0, max = 2_147_483_647): n is number => typeof n === "number" && Number.isSafeInteger(n) && n >= min && n <= max;
export function parseCreatorImagesReconcilePayload(value: unknown): CreatorImagesReconcilePayload {
  const fail = (): never => { throw new JobError("invalid-payload", "Некорректные параметры проверки изображений создателей.", { retryable: false }); };
  if (!value || typeof value !== "object" || Array.isArray(value)) return fail();
  const p = value as Record<string, unknown>;
  if (Object.keys(p).some(k => !["mode", "batchSize", "scope", "creatorId", "platformId", "checkpoint"].includes(k)) || (p.mode !== undefined && p.mode !== "audit" && p.mode !== "repair") || (p.creatorId !== undefined && !integer(p.creatorId, 1))) return fail();
  if (p.scope !== undefined && !["all", "creators", "platforms"].includes(p.scope as string)) return fail();
  if (p.platformId !== undefined && !integer(p.platformId, 1)) return fail();
  if (p.creatorId !== undefined && (p.platformId !== undefined || p.scope === "platforms")) return fail();
  if (p.platformId !== undefined && p.scope === "creators") return fail();
  const scope = p.creatorId !== undefined ? "creators" : p.platformId !== undefined ? "platforms" : p.scope ?? "all";
  const batchSize = p.batchSize === undefined ? 25 : p.batchSize;
  if (!integer(batchSize, 1, 100)) return fail();
  if (p.checkpoint !== undefined) {
    if (!p.checkpoint || typeof p.checkpoint !== "object" || Array.isArray(p.checkpoint)) return fail();
    const c = p.checkpoint as CreatorImagesReconcileCheckpoint;
    if ((c.phase !== undefined && c.phase !== "creators" && c.phase !== "platforms") || (c.throughPlatformId !== undefined && !integer(c.throughPlatformId))) return fail();
    const upper = c.phase === "platforms" ? c.throughPlatformId : c.throughId;
    if (!integer(upper) || !integer(c.afterId) || !integer(c.throughId) || c.afterId > upper || !c.counters || Object.keys(emptyCreatorImagesReconcileCounters()).some(k => !integer(c.counters[k as keyof CreatorImagesReconcileCounters], 0, Number.MAX_SAFE_INTEGER))) return fail();
    if (!Array.isArray(c.errors) || c.errors.length > 100 || c.errors.some(e => !e || !("creatorId" in e ? integer(e.creatorId, 1) : "platformId" in e && integer(e.platformId, 1)) || typeof e.code !== "string" || e.code.length > 150)) return fail();
    if (c.current && (!integer(c.current.id, c.afterId + 1, upper) || !integer(c.current.retryCount, 0, 3))) return fail();
  }
  return { mode: p.mode === "repair" ? "repair" : "audit", batchSize, scope: scope as CreatorImagesReconcilePayload["scope"], ...(p.platformId !== undefined ? { platformId: p.platformId as number } : {}), ...(p.creatorId !== undefined ? { creatorId: p.creatorId as number } : {}), ...(p.checkpoint !== undefined ? { checkpoint: p.checkpoint as CreatorImagesReconcileCheckpoint } : {}) };
}
