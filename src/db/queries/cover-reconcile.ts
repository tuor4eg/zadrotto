import 'server-only';
import { and, asc, eq, gt, inArray, lte, or, sql } from 'drizzle-orm';
import { db } from '@/db';
import { jobRuns, mediaItems, mediaItemMetadata, titleParts } from '@/db/schema';
import { withSnapshotJobGuard, type SnapshotJobGuard } from './provider-snapshots';
import type { CoverReconcileItem, CoverReconcilePayload } from '@/lib/covers/reconcile-model';
import type { CoverSourceInput } from '@/lib/covers/types';

export type ReconcileCoverUpdate = { coverUrl: string; coverThumbUrl: string | null; source?: CoverSourceInput };
export async function getCoverReconcileBounds(p: CoverReconcilePayload) {
  const [m] = await db.select({ id: sql<number>`coalesce(max(${mediaItems.id}),0)::int` }).from(mediaItems)
    .where(and(p.mediaType ? eq(mediaItems.mediaType,p.mediaType) : undefined,p.mediaItemId ? eq(mediaItems.id,p.mediaItemId) : undefined));
  const [part] = await db.select({ id: sql<number>`coalesce(max(${titleParts.id}),0)::int` }).from(titleParts)
    .innerJoin(mediaItems,eq(mediaItems.id,titleParts.mediaItemId))
    .where(and(lte(mediaItems.id,m.id),p.mediaType ? eq(mediaItems.mediaType,p.mediaType) : undefined,p.mediaItemId ? eq(mediaItems.id,p.mediaItemId) : undefined));
  return { throughMediaItemId:m.id, throughPartId:p.includeParts ? part.id : 0 };
}
export async function getCoverReconcileBatch(p: CoverReconcilePayload): Promise<CoverReconcileItem[]> {
  const c=p.checkpoint!;
  const common=[p.mediaType ? eq(mediaItems.mediaType,p.mediaType) : undefined,p.mediaItemId ? eq(mediaItems.id,p.mediaItemId) : undefined];
  if(c.phase==='media-items') {
    const rows=await db.select({ id:mediaItems.id,code:mediaItems.code,title:mediaItems.title,originalTitle:mediaItems.originalTitle,mediaType:mediaItems.mediaType,releaseYear:mediaItems.releaseYear,
      coverUrl:mediaItems.coverUrl,coverThumbUrl:mediaItems.coverThumbUrl,coverSourceProvider:mediaItems.coverSourceProvider,coverSourceExternalId:mediaItems.coverSourceExternalId,coverSourcePageUrl:mediaItems.coverSourcePageUrl }).from(mediaItems)
      .where(and(gt(mediaItems.id,c.afterId),lte(mediaItems.id,c.throughMediaItemId),...common)).orderBy(asc(mediaItems.id)).limit(p.batchSize+1);
    // Bound the parent page before reading metadata: a merge join can rescan the
    // metadata prefix on each cursor page. This is two bounded reads, never N+1.
    const metadata=rows.length ? await db.select({id:mediaItemMetadata.mediaItemId,provider:mediaItemMetadata.sourceProvider,externalId:mediaItemMetadata.sourceExternalId}).from(mediaItemMetadata).where(inArray(mediaItemMetadata.mediaItemId,rows.map(r=>r.id))) : [];
    const byId=new Map(metadata.map(m=>[m.id,m]));
    return rows.map(r=>({...r,kind:'media-item' as const,mediaItemId:r.id,metadataSourceProvider:byId.get(r.id)?.provider??null,metadataSourceExternalId:byId.get(r.id)?.externalId??null}));
  }
  const rows=await db.select({id:titleParts.id,mediaItemId:titleParts.mediaItemId,
    title:sql<string>`${mediaItems.title} || ' — ' || coalesce(${titleParts.name},${titleParts.type} || ' ' || ${titleParts.number}::text)`,mediaType:mediaItems.mediaType,
    coverUrl:titleParts.coverUrl,coverThumbUrl:titleParts.coverThumbUrl,posterSourceUrl:titleParts.posterSourceUrl,sourceProvider:titleParts.sourceProvider,externalId:titleParts.externalId }).from(titleParts)
    .innerJoin(mediaItems,eq(mediaItems.id,titleParts.mediaItemId))
    .where(and(gt(titleParts.id,c.afterId),lte(titleParts.id,c.throughPartId),lte(mediaItems.id,c.throughMediaItemId),...common)).orderBy(asc(titleParts.id)).limit(p.batchSize+1);
  return rows.map(r=>({...r,kind:'title-part' as const}));
}
export async function saveCoverReconcileCheckpoint(guard:SnapshotJobGuard,payload:CoverReconcilePayload) {
  await withSnapshotJobGuard(guard,async tx=>{await tx.update(jobRuns).set({payload:payload as unknown as Record<string,unknown>,updatedAt:new Date()}).where(eq(jobRuns.id,guard.runId));});
}
/** Cover CAS and progress publish in the same fenced transaction. No HTTP under locks. */
export async function commitCoverReconcileItem(input:{item:CoverReconcileItem;update?:ReconcileCoverUpdate;guard:SnapshotJobGuard;signal:AbortSignal;payload:(applied:boolean)=>CoverReconcilePayload}) {
  return withSnapshotJobGuard(input.guard,async tx=>{
    input.signal.throwIfAborted();
    const {item,update}=input;
    let applied=false;
    if(update) {
      const [parent]=await tx.select().from(mediaItems).where(eq(mediaItems.id,item.mediaItemId)).for('update');
      if(item.kind==='media-item') {
        const [metadata]=await tx.select({provider:mediaItemMetadata.sourceProvider,externalId:mediaItemMetadata.sourceExternalId}).from(mediaItemMetadata).where(eq(mediaItemMetadata.mediaItemId,item.id));
        if(parent && parent.mediaType===item.mediaType && parent.coverUrl===item.coverUrl && parent.coverThumbUrl===item.coverThumbUrl && parent.coverSourceProvider===item.coverSourceProvider && parent.coverSourceExternalId===item.coverSourceExternalId && parent.coverSourcePageUrl===item.coverSourcePageUrl && (metadata?.provider??null)===item.metadataSourceProvider && (metadata?.externalId??null)===item.metadataSourceExternalId) {
          await tx.update(mediaItems).set({coverUrl:update.coverUrl,coverThumbUrl:update.coverThumbUrl,coverThumbAttemptedAt:null,updatedAt:new Date(),
            ...(update.source ? {coverSourceProvider:update.source.provider,coverSourceExternalId:update.source.externalId,coverSourcePageUrl:update.source.pageUrl} : {})}).where(eq(mediaItems.id,item.id));applied=true;
        }
      } else if(parent && parent.mediaType===item.mediaType) {
        const [part]=await tx.select().from(titleParts).where(eq(titleParts.id,item.id)).for('update');
        if(part && part.mediaItemId===item.mediaItemId && part.coverUrl===item.coverUrl && part.coverThumbUrl===item.coverThumbUrl && part.posterSourceUrl===item.posterSourceUrl && part.sourceProvider===item.sourceProvider && part.externalId===item.externalId) {
          await tx.update(titleParts).set({coverUrl:update.coverUrl,coverThumbUrl:update.coverThumbUrl,updatedAt:new Date()}).where(eq(titleParts.id,item.id));applied=true;
        }
      }
    }
    const payload=input.payload(applied);
    input.signal.throwIfAborted();
    await tx.update(jobRuns).set({payload:payload as unknown as Record<string,unknown>,updatedAt:new Date()}).where(eq(jobRuns.id,input.guard.runId));
    return {applied,payload};
  });
}
/** Fail closed on unknown publication state; only discard this attempt's unique objects. */
export async function reconcileUploadsReferenced(item:CoverReconcileItem,keys:string[]) {
  return db.transaction(async tx=>{
    await tx.select({id:mediaItems.id}).from(mediaItems).where(eq(mediaItems.id,item.mediaItemId)).for('update');
    if(item.kind==='title-part')await tx.select({id:titleParts.id}).from(titleParts).where(eq(titleParts.id,item.id)).for('update');
    const [m]=await tx.select({id:mediaItems.id}).from(mediaItems).where(or(inArray(mediaItems.coverUrl,keys),inArray(mediaItems.coverThumbUrl,keys))).limit(1);
    const [p]=await tx.select({id:titleParts.id}).from(titleParts).where(or(inArray(titleParts.coverUrl,keys),inArray(titleParts.coverThumbUrl,keys))).limit(1);
    return Boolean(m||p);
  });
}
