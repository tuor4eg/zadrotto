import 'server-only';
import { jobRuns } from '@/db/schema';
import type { DbTransaction } from '@/db/transaction';
import { TIER_PREVIEW_CLEANUP, TIER_PREVIEW_GENERATE } from './preview';

const policy = { source: 'event' as const, maxAttempts: 3, retryBaseSeconds: 60, retryMaxSeconds: 3600, timeoutSeconds: 120 };

export async function queueTierPreview(tx: Pick<DbTransaction, 'insert'>, row: { id: number; version: number; status: string; hiddenAt: Date | null }) {
  if (row.status !== 'published' || row.hiddenAt) return;
  const now = new Date();
  await tx.insert(jobRuns).values({ ...policy, scheduledFor: now, availableAt: now, type: TIER_PREVIEW_GENERATE, payload: { listId: row.id, version: row.version } });
}

export async function queueTierPreviewCleanup(tx: Pick<DbTransaction, 'insert'>, objectKey: string | null, availableAt = new Date()) {
  if (!objectKey) return;
  await tx.insert(jobRuns).values({ ...policy, scheduledFor: new Date(), type: TIER_PREVIEW_CLEANUP, payload: { objectKey }, availableAt });
}
