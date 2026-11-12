import 'server-only';
import { randomUUID } from 'node:crypto';
import { inArray } from 'drizzle-orm';
import { db } from '@/db';
import { mediaItems } from '@/db/schema';
import { getPublishedTierPreviewSource, installTierPreview, isTierPreviewAssigned } from '@/db/queries/tier-list-previews';
import { getTierAvailableIds } from '@/db/queries/tier-lists';
import { withSnapshotJobGuard } from '@/db/queries/provider-snapshots';
import { fetchS3Object, uploadS3Object, deleteS3Object } from '@/lib/services/minio';
import { JobError, type JobHandlerDefinition } from '@/lib/jobs/types';
import { tierBackground, tierEntryIds } from './model';
import { isTierPreviewKey, TIER_PREVIEW_CLEANUP, TIER_PREVIEW_GENERATE } from './preview';
import { queueTierPreviewCleanup } from './preview-queue';
import { renderTierListPreview } from './preview-render';

type Payload = { listId: number; version: number };

async function coverBuffer(key: string | null, signal: AbortSignal): Promise<Buffer | null> {
  // Read only this application's object store, never arbitrary URLs from record metadata.
  if (!key || /^https?:/i.test(key) || key.startsWith('/') || key.includes('..')) return null;
  try {
    const response = await fetchS3Object({ objectKey: key, signal });
    if (!response?.body) return null;
    if (Number(response.headers.get('content-length')) > 5 * 1024 * 1024) { await response.body.cancel(); return null; }
    const reader = response.body.getReader();
    const chunks: Uint8Array[] = [];
    let size = 0;
    try {
      while (true) {
        const { done, value } = await reader.read();
        if (done) break;
        size += value.length;
        if (size > 5 * 1024 * 1024) return null;
        chunks.push(value);
      }
      return Buffer.concat(chunks);
    } finally { await reader.cancel(); }
  } catch (error) { if (signal.aborted) throw error; return null; }
}

export const tierPreviewGenerateHandler: JobHandlerDefinition<Payload> = {
  type: TIER_PREVIEW_GENERATE, label: 'Миниатюра тир-листа', schedulable: false, defaultMaxAttempts: 3, defaultTimeoutSeconds: 120,
  parsePayload(value) {
    const input = value as Partial<Payload> | null;
    if (!input || Object.keys(input).some(key => key !== 'listId' && key !== 'version') || !Number.isSafeInteger(input.listId) || input.listId! < 1 || !Number.isSafeInteger(input.version) || input.version! < 1) throw new JobError('invalid-payload', 'Некорректный тир-лист для миниатюры.', { retryable: false });
    return { listId: input.listId!, version: input.version! };
  },
  async execute({ payload, signal, runId, lockToken }) {
    signal.throwIfAborted();
    const source = await getPublishedTierPreviewSource(payload.listId);
    if (!source || source.version !== payload.version || source.previewVersion === payload.version) return;
    const available = new Set(await getTierAvailableIds(tierEntryIds(source.distribution)));
    const occupied = source.configuration.levels.filter(level => source.distribution[level.id].some(id => available.has(id)));
    const levels = occupied.length <= 6 ? occupied : Array.from({ length: 6 }, (_, i) => occupied[Math.round(i * (occupied.length - 1) / 5)]!);
    const rows = levels.map(level => ({ color: level.color, ids: source.distribution[level.id].filter(id => available.has(id)).slice(0, 4) }));
    const ids = rows.flatMap(row => row.ids);
    const covers = ids.length ? await db.select({ id: mediaItems.id, cover: mediaItems.coverUrl, thumb: mediaItems.coverThumbUrl }).from(mediaItems).where(inArray(mediaItems.id, ids)) : [];
    const buffers = new Map<number, Buffer | null>();
    for (let start = 0; start < covers.length; start += 4) {
      signal.throwIfAborted();
      await Promise.all(covers.slice(start, start + 4).map(async row => buffers.set(row.id, await coverBuffer(row.thumb ?? row.cover, signal))));
    }
    const body = await renderTierListPreview({ backgroundColor: tierBackground(source.configuration), rows: rows.map(row => ({ color: row.color, posters: row.ids.map(id => buffers.get(id) ?? null) })) });
    signal.throwIfAborted();
    const objectKey = `tier-lists/previews/${source.id}/${randomUUID()}.webp`;
    const guard = lockToken ? { runId, lockToken } : undefined;
    // A durable delayed cleanup covers a process crash between upload and CAS install.
    await withSnapshotJobGuard(guard, tx => queueTierPreviewCleanup(tx, objectKey, new Date(Date.now() + 3600000)));
    await uploadS3Object({ objectKey, body, contentType: 'image/webp' });
    try {
      signal.throwIfAborted();
      if (!await installTierPreview(source, objectKey, ids, guard)) await deleteS3Object({ objectKey });
    } catch (error) {
      // Delayed cleanup remains queued if deleting this uninstalled upload fails.
      if (!await isTierPreviewAssigned(objectKey)) await deleteS3Object({ objectKey }).catch(() => {});
      throw error;
    }
  },
};

export const tierPreviewCleanupHandler: JobHandlerDefinition<{ objectKey: string }> = {
  type: TIER_PREVIEW_CLEANUP, label: 'Удаление миниатюры тир-листа', schedulable: false,
  parsePayload(value) {
    const input = value as { objectKey?: unknown } | null;
    if (!input || Object.keys(input).length !== 1 || !isTierPreviewKey(input.objectKey)) throw new JobError('invalid-payload', 'Некорректный ключ миниатюры.', { retryable: false });
    return { objectKey: input.objectKey };
  },
  async execute({ payload, signal }) {
    signal.throwIfAborted();
    if (!await isTierPreviewAssigned(payload.objectKey)) await deleteS3Object(payload);
  },
};
