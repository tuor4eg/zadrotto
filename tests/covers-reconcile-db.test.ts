import './fixtures/server-runtime';
import assert from 'node:assert/strict';
import test from 'node:test';
import { eq } from 'drizzle-orm';
import { db, dbClient } from '../src/db';
import { jobRuns, mediaItems, mediaItemMetadata } from '../src/db/schema';
import { commitCoverReconcileItem, getCoverReconcileBatch, getCoverReconcileBounds } from '../src/db/queries/cover-reconcile';
import { emptyCoverReconcileCounters, parseCoverReconcilePayload } from '../src/lib/covers/reconcile-model';

const enabled=process.env.COVER_RECONCILE_DB_TEST==='1';
test('isolated PostgreSQL: manual cover edit, metadata change and lost lease prevent stale publication', {skip:!enabled},async()=>{
 assert.match(new URL(process.env.DATABASE_URL!).pathname,/^\/recovery_cover_reconcile_test_/,'Only an isolated recovery test DB is allowed');
 const now=new Date();const [run]=await db.insert(jobRuns).values({type:'media.covers-reconcile',source:'manual',status:'running',scheduledFor:now,availableAt:now,maxAttempts:3,timeoutSeconds:300,retryBaseSeconds:1,retryMaxSeconds:30,lockToken:'test-owner',lockExpiresAt:new Date(Date.now()+300000)}).returning();
 const guard={runId:run.id,lockToken:'test-owner'};
 try{
  const base=parseCoverReconcilePayload({mode:'repair',includeParts:false,batchSize:1});
  const payload={...base,checkpoint:{phase:'media-items' as const,afterId:0,...await getCoverReconcileBounds(base),counters:emptyCoverReconcileCounters(),errors:[]}};
  const [item]=await getCoverReconcileBatch(payload);assert.ok(item);assert.equal(item.kind,'media-item');
  const [before]=await db.select().from(mediaItems).where(eq(mediaItems.id,item.id));
  const metadataBefore=await db.select().from(mediaItemMetadata).where(eq(mediaItemMetadata.mediaItemId,item.id));
  await db.update(mediaItems).set({coverUrl:'covers/manually-edited.jpg'}).where(eq(mediaItems.id,item.id));
  const commit=(candidate:typeof item,token=guard)=>commitCoverReconcileItem({item:candidate,update:{coverUrl:'covers/recovered.jpg',coverThumbUrl:'covers/recovered-thumb.webp'},guard:token,signal:new AbortController().signal,payload:applied=>({...payload,checkpoint:{...payload.checkpoint,afterId:applied?item.id:0}})});
  assert.equal((await commit(item)).applied,false);
  const [fresh]=await getCoverReconcileBatch(payload);assert.ok(fresh);
  await assert.rejects(commit(fresh,{...guard,lockToken:'old-owner'}),e=>e instanceof Error&&'code' in e&&e.code==='lease-lost');
  const [unchanged]=await db.select().from(mediaItems).where(eq(mediaItems.id,item.id));assert.equal(unchanged.coverUrl,'covers/manually-edited.jpg');
  if(metadataBefore.length){
   await db.update(mediaItemMetadata).set({sourceExternalId:'changed-binding-for-test'}).where(eq(mediaItemMetadata.mediaItemId,item.id));
   assert.equal((await commit(fresh)).applied,false);
   await db.update(mediaItemMetadata).set({sourceExternalId:metadataBefore[0].sourceExternalId}).where(eq(mediaItemMetadata.mediaItemId,item.id));
  }
  const committed=await commit(fresh);assert.equal(committed.applied,true);
  const [after]=await db.select().from(mediaItems).where(eq(mediaItems.id,item.id));
  assert.equal(after.coverUrl,'covers/recovered.jpg');assert.equal(after.coverThumbUrl,'covers/recovered-thumb.webp');
  for(const key of Object.keys(before) as (keyof typeof before)[])if(!['coverUrl','coverThumbUrl','coverThumbAttemptedAt','updatedAt'].includes(key))assert.deepEqual(after[key],before[key],`unrelated field ${key}`);
  assert.deepEqual(await db.select().from(mediaItemMetadata).where(eq(mediaItemMetadata.mediaItemId,item.id)),metadataBefore);
  const [saved]=await db.select().from(jobRuns).where(eq(jobRuns.id,run.id));assert.deepEqual(saved.payload,committed.payload);
  await db.update(jobRuns).set({lockExpiresAt:new Date(Date.now()-1000)}).where(eq(jobRuns.id,run.id));
  await assert.rejects(commit(fresh),e=>e instanceof Error&&'code' in e&&e.code==='lease-lost');
 }finally{await dbClient.end();}
});
