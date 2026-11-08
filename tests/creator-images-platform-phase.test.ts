import './fixtures/server-runtime';
import assert from 'node:assert/strict';
import test from 'node:test';
import { runCreatorImagesReconcile, type CreatorImagesReconcileDependencies } from '../src/lib/covers/creator-images-reconcile-job';
import { parseCreatorImagesReconcilePayload, emptyCreatorImagesReconcileCounters, type CreatorImagesReconcilePayload } from '../src/lib/covers/creator-images-reconcile-model';
import type { PlatformImagesReconcileRow } from '../src/db/queries/platform-images-reconcile';
import type { PlatformLogoReconcileResult } from '../src/lib/covers/platform-images-reconcile';
const guard={runId:9,lockToken:'owner'};
const signal=new AbortController().signal;
const row=(id:number)=>({platform:{id}} as PlatformImagesReconcileRow);
const healthy:PlatformLogoReconcileResult={status:'healthy',code:'present',manualMissing:false,importedMissing:false};
function fixture(rows:PlatformImagesReconcileRow[]=[row(1)],results:PlatformLogoReconcileResult[]=[healthy]){
 let saved:CreatorImagesReconcilePayload|undefined;let upperCalls=0;let creatorReads=0;const processed:number[]=[];
 const logs:Record<string,unknown>[]=[];
 const deps:CreatorImagesReconcileDependencies={
  upperId:async()=>0,batch:async()=>{creatorReads++;return [];},platformUpperId:async()=>{upperCalls++;return 3;},
  platformBatch:async p=>rows.filter(r=>r.platform.id>p.afterId&&r.platform.id<=p.throughId&&(!p.platformId||r.platform.id===p.platformId)).slice(0,p.batchSize+1),
  platformProcess:async r=>{processed.push(r.platform.id);return results.shift()??healthy;},
  save:async(_g,p)=>{assert.equal(_g,guard);saved=structuredClone(p);},log:async p=>{logs.push(p);},
 };
 return {deps,processed,logs,get saved(){return saved!;},get upperCalls(){return upperCalls;},get creatorReads(){return creatorReads;}};
}
test('default all scope captures both bounds and continues to platforms using the same run',async()=>{
 const f=fixture();const input=parseCreatorImagesReconcilePayload({});
 await assert.rejects(runCreatorImagesReconcile(input,guard,signal,f.deps),{code:'creator-images-continue'});
 assert.equal(f.saved.checkpoint?.phase,'platforms');assert.equal(f.saved.checkpoint?.throughPlatformId,3);assert.equal(f.upperCalls,1);
 await runCreatorImagesReconcile(parseCreatorImagesReconcilePayload(f.saved),guard,signal,f.deps);
 assert.equal(f.upperCalls,1);assert.deepEqual(f.processed,[1]);assert.equal(f.saved.checkpoint?.counters.checked,1);
 assert.equal(f.logs.at(-1)?.entityId,guard.runId);
});
test('target IDs constrain scopes and incompatible scopes/checkpoints are rejected',()=>{
 assert.equal(parseCreatorImagesReconcilePayload({creatorId:2}).scope,'creators');assert.equal(parseCreatorImagesReconcilePayload({platformId:3}).scope,'platforms');
 for(const p of [{creatorId:1,platformId:1},{creatorId:1,scope:'platforms'},{platformId:1,scope:'creators'},{scope:['all']},{batchSize:null}])assert.throws(()=>parseCreatorImagesReconcilePayload(p));
 const checkpoint={phase:'platforms',afterId:4,throughId:100,throughPlatformId:3,counters:emptyCreatorImagesReconcileCounters(),errors:[]};
 assert.throws(()=>parseCreatorImagesReconcilePayload({checkpoint}));
 assert.doesNotThrow(()=>parseCreatorImagesReconcilePayload({checkpoint:{...checkpoint,afterId:1,current:{id:2,retryCount:1}}}));
});
test('platform-only filtering does not query creators and keeps counters across bounded continuation',async()=>{
 const f=fixture([row(1),row(2),row(3)],[{...healthy,status:'restored',manualMissing:true,importedMissing:true},healthy,healthy]);
 let p=parseCreatorImagesReconcilePayload({scope:'platforms',batchSize:1,mode:'repair'});
 await assert.rejects(runCreatorImagesReconcile(p,guard,signal,f.deps),{code:'creator-images-continue'});
 assert.equal(f.creatorReads,0);assert.equal(f.saved.checkpoint?.counters.restored,1);assert.equal(f.saved.checkpoint?.counters.skipped,1);
 p=parseCreatorImagesReconcilePayload({...f.saved,mode:'repair'});
 await assert.rejects(runCreatorImagesReconcile(p,guard,signal,f.deps),{code:'creator-images-continue'});
 await runCreatorImagesReconcile(parseCreatorImagesReconcilePayload(f.saved),guard,signal,f.deps);
 assert.deepEqual(f.processed,[1,2,3]);assert.equal(f.saved.checkpoint?.counters.checked,3);assert.equal(f.upperCalls,1);
 const target=fixture([row(1),row(2),row(3)]);await runCreatorImagesReconcile(parseCreatorImagesReconcilePayload({platformId:2}),guard,signal,target.deps);assert.deepEqual(target.processed,[2]);assert.equal(target.creatorReads,0);
});
test('transient retries retain platform cursor, stop after three attempts, then continue remaining rows',async()=>{
 const f=fixture([row(1),row(2)],[...Array.from({length:3},()=>({...healthy,status:'retry' as const,code:'SlowDown',importedMissing:true})),healthy]);
 let p=parseCreatorImagesReconcilePayload({scope:'platforms',mode:'repair'});
 for(let i=1;i<3;i++){
  await assert.rejects(runCreatorImagesReconcile(p,guard,signal,f.deps),{code:'creator-images-retry'});
  assert.equal(f.saved.checkpoint?.afterId,0);assert.equal(f.saved.checkpoint?.current?.retryCount,i);p=parseCreatorImagesReconcilePayload(f.saved);
 }
 await assert.rejects(runCreatorImagesReconcile(p,guard,signal,f.deps),{code:'creator-images-partial'});
 assert.equal(f.saved.checkpoint?.counters.failed,1);assert.equal(f.saved.checkpoint?.counters.checked,2);assert.deepEqual(f.saved.checkpoint?.errors,[{platformId:1,code:'SlowDown'}]);
});
test('fatal storage, cancellation and lost lease never advance the current platform',async()=>{
 const fatal=fixture([row(1)],[{...healthy,status:'fatal',code:'AccessDenied'}]);
 await assert.rejects(runCreatorImagesReconcile(parseCreatorImagesReconcilePayload({scope:'platforms'}),guard,signal,fatal.deps),{code:'creator-images-storage-fatal'});assert.equal(fatal.saved.checkpoint?.afterId,0);
 const cancelled=fixture();const controller=new AbortController();cancelled.deps.platformProcess=async()=>{controller.abort();return healthy;};
 await assert.rejects(runCreatorImagesReconcile(parseCreatorImagesReconcilePayload({scope:'platforms'}),guard,controller.signal,cancelled.deps));assert.equal(cancelled.saved.checkpoint?.afterId,0);
 const lease=fixture();lease.deps.platformProcess=async()=>{throw Object.assign(new Error('lease'),{code:'lease-lost'});};
 await assert.rejects(runCreatorImagesReconcile(parseCreatorImagesReconcilePayload({scope:'platforms'}),guard,signal,lease.deps),{code:'lease-lost'});assert.equal(lease.saved.checkpoint?.afterId,0);
});
test('legacy creator checkpoint can continue and missing current platform is reported once',async()=>{
 const f=fixture([]);const checkpoint={afterId:0,throughId:1,counters:emptyCreatorImagesReconcileCounters(),errors:[]};
 await assert.rejects(runCreatorImagesReconcile(parseCreatorImagesReconcilePayload({checkpoint}),guard,signal,f.deps),{code:'creator-images-continue'});
 await runCreatorImagesReconcile(parseCreatorImagesReconcilePayload({...f.saved,checkpoint:{...f.saved.checkpoint,current:{id:1,retryCount:1}}}),guard,signal,f.deps);
 assert.equal(f.saved.checkpoint?.counters.checked,1);assert.equal(f.saved.checkpoint?.counters.skipped,1);
});
