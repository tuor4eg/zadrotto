import './fixtures/server-runtime';
import assert from 'node:assert/strict';
import test from 'node:test';
import { processReconcileCover, type CoverProcessDependencies } from '../src/lib/covers/reconcile-process';
import { parseCoverReconcilePayload, emptyCoverReconcileCounters, type CoverReconcileMediaItem, type CoverReconcilePart } from '../src/lib/covers/reconcile-model';

const item: CoverReconcileMediaItem = {kind:'media-item',id:1,mediaItemId:1,code:'one',title:'One',originalTitle:null,mediaType:'film',releaseYear:null,coverUrl:'covers/old.jpg',coverThumbUrl:'covers/old-thumb.webp',coverSourceProvider:'tmdb',coverSourceExternalId:'movie:1:/a.jpg',coverSourcePageUrl:null,metadataSourceProvider:'tmdb',metadataSourceExternalId:'1'};
const candidate={id:'movie:1:/a.jpg',provider:'tmdb' as const,title:'One',imageUrl:'https://image.tmdb.org/t/p/original/a.jpg',sourcePageUrl:null};
const source={provider:'tmdb' as const,externalId:candidate.id,pageUrl:null};
const signal=new AbortController().signal;
function setup(present:string[]=[]) {
 const calls:{probes:string[];resolve:number;upload:number;thumb:number;part:number}={probes:[],resolve:0,upload:0,thumb:0,part:0};
 const deps:CoverProcessDependencies={
  probe:async ({objectKey})=>{calls.probes.push(objectKey);return present.includes(objectKey)?{status:'exists'}:{status:'missing'};},
  resolve:async()=>{calls.resolve++;return {kind:'candidate',candidate,replacement:false,exactImage:true};},
  upload:async()=>{calls.upload++;return {ok:true,coverUrl:'covers/new.jpg',coverThumbUrl:'covers/new-thumb.webp',source};},
  thumbnail:async()=>{calls.thumb++;return {ok:true,coverThumbUrl:'covers/new-thumb.webp'};},
  uploadPart:async()=>{calls.part++;return {ok:true,coverUrl:'covers/part.jpg',coverThumbUrl:'covers/part-thumb.webp',source};},
 };
 return {calls,deps};
}
const repair=parseCoverReconcilePayload({mode:'repair'});
test('payload defaults and strict checkpoint limits',()=>{
 assert.equal(parseCoverReconcilePayload({}).mode,'audit');assert.equal(repair.includeParts,true);
 for(const mode of [['repair'],{},1,null])assert.throws(()=>parseCoverReconcilePayload({mode}));
 const checkpoint={phase:'media-items',afterId:0,throughMediaItemId:2,throughPartId:0,counters:emptyCoverReconcileCounters(),errors:[]};
 assert.doesNotThrow(()=>parseCoverReconcilePayload({checkpoint}));
 for(const bad of [{afterId:3},{throughMediaItemId:2147483648},{current:{id:3,retryCount:0,restored:false,replaced:false}}])assert.throws(()=>parseCoverReconcilePayload({checkpoint:{...checkpoint,...bad}}));
});
test('audit checks filled object references independently and never resolves or uploads',async()=>{
 for(const present of [[],[item.coverUrl!],[item.coverThumbUrl!],[item.coverUrl!,item.coverThumbUrl!]]){
  const s=setup(present);const r=await processReconcileCover(item,parseCoverReconcilePayload({}),signal,s.deps);
  assert.deepEqual(s.calls.probes.sort(),[item.coverUrl!,item.coverThumbUrl!].sort());assert.equal(s.calls.resolve+s.calls.upload+s.calls.thumb,0);
  assert.equal(r.status,present.length===2?'healthy':'audit');assert.equal(r.findings?.missingOriginal,!present.includes(item.coverUrl!));assert.equal(r.findings?.missingThumbnail,!present.includes(item.coverThumbUrl!));
 }
});
test('healthy images remain unchanged and a missing thumbnail is generated from surviving original',async()=>{
 const s=setup([item.coverUrl!]);const r=await processReconcileCover(item,repair,signal,s.deps);
 assert.equal(r.status,'restored');assert.equal(r.update?.coverUrl,item.coverUrl);assert.equal(r.update?.coverThumbUrl,'covers/new-thumb.webp');assert.equal(s.calls.resolve+s.calls.upload,0);assert.equal(s.calls.thumb,1);
 const healthy=setup([item.coverUrl!,item.coverThumbUrl!]);assert.equal((await processReconcileCover(item,repair,signal,healthy.deps)).status,'healthy');assert.equal(healthy.calls.upload+healthy.calls.thumb,0);
});
test('lost original replaces any surviving thumbnail with its matching new thumbnail',async()=>{
 const s=setup([item.coverThumbUrl!]);const r=await processReconcileCover(item,repair,signal,s.deps);assert.equal(r.status,'restored');assert.deepEqual(r.update,{coverUrl:'covers/new.jpg',coverThumbUrl:'covers/new-thumb.webp',source});assert.equal(s.calls.upload,1);
});
test('empty opt-in is independent of replacement and external images are skipped',async()=>{
 for(const includeEmpty of [false,true])for(const allowReplacement of [false,true]){
  const s=setup();const r=await processReconcileCover({...item,coverUrl:null,coverThumbUrl:null},{...repair,includeEmpty,allowReplacement},signal,s.deps);assert.equal(r.status,includeEmpty?'restored':'skipped');assert.equal(s.calls.resolve,includeEmpty?1:0);
 }
 const s=setup();assert.equal((await processReconcileCover({...item,coverUrl:'https://example.com/a.jpg'},repair,signal,s.deps)).status,'external');assert.equal(s.calls.probes.length,0);
});
test('unavailable exact variant falls back only with replacement permission',async()=>{
 for(const allowReplacement of [false,true]){
  const s=setup();let uploads=0;let force=false;s.deps.resolve=async(_item,p)=>{force=Boolean(p.forceReplacement);return {kind:'candidate',candidate,replacement:force,exactImage:!force};};
  s.deps.upload=async()=>++uploads===1?{ok:false,error:'cover-fetch',httpStatusCode:404,retryable:false}:{ok:true,coverUrl:'new',coverThumbUrl:'newthumb',source};
  const r=await processReconcileCover(item,{...repair,allowReplacement},signal,s.deps);assert.equal(r.status,allowReplacement?'restored':'skipped');assert.equal(uploads,allowReplacement?2:1);assert.equal(force,allowReplacement);
 }
});
test('S3 configuration failure is fatal, transient failure retries, no provider requests',async()=>{
 for(const fatal of [false,true]){
  const s=setup();s.deps.probe=async()=>({status:'error',code:fatal?'AccessDenied':'SlowDown',fatal,retryable:!fatal});const r=await processReconcileCover(item,repair,signal,s.deps);assert.equal(r.status,'retry');assert.equal(r.fatal,fatal);assert.equal(s.calls.resolve,0);
 }
});
test('partial thumbnail failure publishes original and clears unrelated old thumbnail',async()=>{
 const s=setup();s.deps.upload=async()=>({ok:true,coverUrl:'new',coverThumbUrl:null,source,thumbnailError:'thumbnail-upload',thumbnailRetryable:true});const r=await processReconcileCover(item,repair,signal,s.deps);assert.equal(r.status,'retry');assert.equal(r.update?.coverUrl,'new');assert.equal(r.update?.coverThumbUrl,null);
});
test('cancel after upload returns owned objects for cleanup; a reappeared original prevents publication',async()=>{
 const controller=new AbortController();const s=setup([item.coverUrl!]);s.deps.thumbnail=async()=>{controller.abort();return {ok:true,coverThumbUrl:'owned'};};
 const cancelled=await processReconcileCover(item,repair,controller.signal,s.deps);assert.equal(cancelled.code,'cancelled');assert.equal(cancelled.objects?.coverThumbUrl,'owned');assert.equal(cancelled.update,undefined);
 const t=setup();let probes=0;t.deps.probe=async()=>++probes>2?{status:'exists'}:{status:'missing'};const r=await processReconcileCover(item,repair,signal,t.deps);assert.equal(r.code,'source-reappeared');assert.equal(r.update,undefined);assert.equal(r.objects?.coverUrl,'covers/new.jpg');
});
test('parts recover only from their saved TMDB poster, without parent cover resolution',async()=>{
 const part:CoverReconcilePart={kind:'title-part',id:2,mediaItemId:1,title:'Season',mediaType:'tv',coverUrl:'old',coverThumbUrl:null,posterSourceUrl:'https://image.tmdb.org/t/p/original/season.jpg',sourceProvider:'tmdb',externalId:'season:2'};
 const s=setup();assert.equal((await processReconcileCover(part,repair,signal,s.deps)).status,'restored');assert.equal(s.calls.part,1);assert.equal(s.calls.resolve,0);
 assert.equal((await processReconcileCover({...part,posterSourceUrl:null},repair,signal,s.deps)).code,'part-source-missing');
});
