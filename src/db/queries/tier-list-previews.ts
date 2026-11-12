import 'server-only';
import { and, eq, isNull, sql } from 'drizzle-orm';
import { db } from '@/db';
import { authorAccounts, authors, tierLists } from '@/db/schema';
import { lockAuthorForTransaction } from '@/db/transaction';
import { guardSnapshotJob, type SnapshotJobGuard } from './provider-snapshots';
import { queueTierPreview, queueTierPreviewCleanup } from '@/lib/tier-lists/preview-queue';
import { tierPreviewListId } from '@/lib/tier-lists/preview';

export async function getPublishedTierPreviewSource(listId: number) {
  const [row] = await db.select({ list: tierLists }).from(tierLists).innerJoin(authors, eq(authors.id, tierLists.authorId))
    .where(and(eq(tierLists.id, listId), eq(tierLists.status, 'published'), isNull(tierLists.hiddenAt), isNull(authors.blockedAt), isNull(authors.mergedIntoAuthorId), sql`not exists (select 1 from ${authorAccounts} account where account.author_id = ${authors.id} and account.status <> 'active')`));
  return row?.list ?? null;
}

/** CAS install: no editing version/timestamps change, and old workers cannot overwrite new previews. */
export async function installTierPreview(source: { id: number; authorId: number; version: number }, objectKey: string, mediaIds: number[], guard?: SnapshotJobGuard) {
  return db.transaction(async tx => {
    await tx.execute(sql`select pg_advisory_xact_lock_shared(90420261)`);
    await tx.execute(sql`lock table authors, job_runs, tier_lists in row exclusive mode`);
    await guardSnapshotJob(tx, guard);
    await lockAuthorForTransaction(tx, source.authorId);
    const [row] = await tx.select().from(tierLists).where(eq(tierLists.id, source.id)).for('update');
    if (row && row.authorId !== source.authorId && row.version === source.version && row.previewVersion !== row.version) await queueTierPreview(tx, row);
    if (!row || row.authorId !== source.authorId || row.version !== source.version || row.status !== 'published' || row.hiddenAt || row.previewVersion === source.version) return false;
    await tx.update(tierLists).set({ previewObjectKey: objectKey, previewVersion: source.version, previewMediaIds: mediaIds }).where(eq(tierLists.id, source.id));
    await queueTierPreviewCleanup(tx, row.previewObjectKey);
    await guardSnapshotJob(tx, guard);
    return true;
  });
}

export async function isTierPreviewAssigned(objectKey: string) {
  const id = tierPreviewListId(objectKey);
  if (!id) return false;
  const [row] = await db.select({ id: tierLists.id }).from(tierLists).where(and(eq(tierLists.id, id), eq(tierLists.previewObjectKey, objectKey)));
  return !!row;
}
