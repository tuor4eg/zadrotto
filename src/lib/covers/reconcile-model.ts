import type { CoverCandidate } from './types';
import { JobError } from '@/lib/jobs/types';

export type CoverReconcilePhase = 'media-items' | 'title-parts';
export type CoverReconcileCounters = {
  checked: number; healthy: number; missingOriginal: number; missingThumbnail: number;
  empty: number; restored: number; replaced: number; skipped: number; failed: number; external: number;
};
export type CoverReconcileFindings = { missingOriginal: boolean; missingThumbnail: boolean; empty: boolean };
export type CoverReconcileCheckpoint = {
  phase: CoverReconcilePhase; afterId: number; throughMediaItemId: number; throughPartId: number;
  counters: CoverReconcileCounters;
  current?: { id: number; retryCount: number; findings?: CoverReconcileFindings; restored: boolean; replaced: boolean };
  errors: { kind: 'media-item' | 'title-part'; id: number; code: string }[];
};
export type CoverReconcilePayload = {
  mode: 'audit' | 'repair'; includeEmpty: boolean; allowReplacement: boolean;
  includeParts: boolean; batchSize: number; mediaType?: string; mediaItemId?: number;
  checkpoint?: CoverReconcileCheckpoint;
};
export type CoverReconcileMediaItem = {
  kind: 'media-item'; id: number; mediaItemId: number; code: string; title: string;
  originalTitle: string | null; mediaType: string; releaseYear: number | null;
  coverUrl: string | null; coverThumbUrl: string | null;
  coverSourceProvider: string | null; coverSourceExternalId: string | null; coverSourcePageUrl: string | null;
  metadataSourceProvider: string | null; metadataSourceExternalId: string | null;
};
export type CoverReconcilePart = {
  kind: 'title-part'; id: number; mediaItemId: number; title: string; mediaType: string;
  coverUrl: string | null; coverThumbUrl: string | null; posterSourceUrl: string | null;
  sourceProvider: string | null; externalId: string | null;
};
export type CoverReconcileItem = CoverReconcileMediaItem | CoverReconcilePart;
export type CoverRecoveryResolution =
  | { kind: 'candidate'; candidate: CoverCandidate; replacement: boolean; exactImage: boolean }
  | { kind: 'skip'; code: string };

export class CoverRecoveryError extends Error {
  constructor(readonly code: string, readonly retryable = false, readonly deferSeconds?: number, readonly fatal = false) {
    super(code);
  }
}

export const COVER_RECONCILE_JOB_TYPE = 'media.covers-reconcile';
export const emptyCoverReconcileCounters = (): CoverReconcileCounters => ({
  checked: 0, healthy: 0, missingOriginal: 0, missingThumbnail: 0, empty: 0,
  restored: 0, replaced: 0, skipped: 0, failed: 0, external: 0,
});

export function parseCoverReconcilePayload(value: unknown): CoverReconcilePayload {
  if (!value || typeof value !== 'object' || Array.isArray(value)) throw new JobError('invalid-payload', 'Некорректные параметры проверки обложек.', { retryable: false });
  const p = value as Record<string, unknown>;
  const allowed = ['mode', 'includeEmpty', 'allowReplacement', 'includeParts', 'batchSize', 'mediaType', 'mediaItemId', 'checkpoint'];
  if (Object.keys(p).some(k => !allowed.includes(k)) || (p.mode !== undefined && p.mode !== 'audit' && p.mode !== 'repair')) throw new JobError('invalid-payload', 'Некорректный режим проверки обложек.', { retryable: false });
  for (const k of ['includeEmpty', 'allowReplacement', 'includeParts']) if (p[k] !== undefined && typeof p[k] !== 'boolean') throw new JobError('invalid-payload', 'Некорректный флаг проверки обложек.', { retryable: false });
  const batchSize = p.batchSize === undefined ? 25 : p.batchSize;
  if (!Number.isSafeInteger(batchSize) || Number(batchSize) < 1 || Number(batchSize) > 100) throw new JobError('invalid-payload', 'Размер партии должен быть от 1 до 100.', { retryable: false });
  if (p.mediaType !== undefined && (typeof p.mediaType !== 'string' || !/^[a-z][a-z0-9-]{0,63}$/.test(p.mediaType))) throw new JobError('invalid-payload', 'Некорректный тип записи.', { retryable: false });
  if (p.mediaItemId !== undefined && (!Number.isSafeInteger(p.mediaItemId) || Number(p.mediaItemId) <= 0 || Number(p.mediaItemId) > 2147483647)) throw new JobError('invalid-payload', 'Некорректный ID записи.', { retryable: false });
  if (p.checkpoint !== undefined) validateCheckpoint(p.checkpoint);
  return { mode: (p.mode ?? 'audit') as CoverReconcilePayload['mode'], includeEmpty: p.includeEmpty === true,
    allowReplacement: p.allowReplacement === true, includeParts: p.includeParts !== false, batchSize: Number(batchSize),
    ...(p.mediaType !== undefined ? { mediaType: p.mediaType as string } : {}),
    ...(p.mediaItemId !== undefined ? { mediaItemId: p.mediaItemId as number } : {}),
    ...(p.checkpoint !== undefined ? { checkpoint: p.checkpoint as CoverReconcileCheckpoint } : {}) };
}
function validateCheckpoint(value: unknown): asserts value is CoverReconcileCheckpoint {
  const fail = () => { throw new JobError('invalid-payload', 'Некорректное продолжение проверки обложек.', { retryable: false }); };
  if (!value || typeof value !== 'object' || Array.isArray(value)) return fail();
  const c = value as CoverReconcileCheckpoint;
  if (!['media-items', 'title-parts'].includes(c.phase) || ![c.afterId, c.throughMediaItemId, c.throughPartId].every(n => Number.isSafeInteger(n) && n >= 0 && n <= 2147483647)) return fail();
  const upper = c.phase === 'media-items' ? c.throughMediaItemId : c.throughPartId;
  if (c.afterId > upper) return fail();
  if (!c.counters || Object.keys(emptyCoverReconcileCounters()).some(k => !Number.isSafeInteger(c.counters[k as keyof CoverReconcileCounters]) || c.counters[k as keyof CoverReconcileCounters] < 0)) return fail();
  if (!Array.isArray(c.errors) || c.errors.length > 100 || c.errors.some(e => !e || !['media-item', 'title-part'].includes(e.kind) || !Number.isSafeInteger(e.id) || e.id <= 0 || e.id > 2147483647 || typeof e.code !== 'string' || e.code.length > 150)) return fail();
  if (c.current && (!Number.isSafeInteger(c.current.id) || c.current.id <= c.afterId || c.current.id > upper || !Number.isSafeInteger(c.current.retryCount) || c.current.retryCount < 0 || c.current.retryCount > 3 || typeof c.current.restored !== 'boolean' || typeof c.current.replaced !== 'boolean' || (c.current.findings && ['missingOriginal', 'missingThumbnail', 'empty'].some(k => typeof c.current!.findings![k as keyof CoverReconcileFindings] !== 'boolean')))) return fail();
}
