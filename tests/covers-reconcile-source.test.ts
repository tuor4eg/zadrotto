import './fixtures/server-runtime';
import test from 'node:test';
import assert from 'node:assert/strict';
import { createCoverRecoveryResolver, parseSavedCoverSource } from '../src/lib/covers/reconcile-source';
import type { CoverReconcileMediaItem } from '../src/lib/covers/reconcile-model';
import type { MediaProvider } from '../src/lib/covers/types';
const item: CoverReconcileMediaItem = { kind: 'media-item', id: 1, mediaItemId: 1, code: 'x', title: 'X', originalTitle: null, mediaType: 'film', releaseYear: null, coverUrl: '/covers/x.jpg', coverThumbUrl: null, coverSourceProvider: 'tmdb', coverSourceExternalId: 'movie:42:/poster.jpg', coverSourcePageUrl: null, metadataSourceProvider: 'tmdb', metadataSourceExternalId: '42' };
const policy = { allowReplacement: false, includeEmpty: false, signal: new AbortController().signal };
test('saved candidate formats distinguish work bindings from image IDs', () => {
  for (const [provider, id, expected] of [['tmdb','movie:42:/poster.jpg','42'], ['igdb','game:7:co123','7'], ['open-library','work:/works/OL123W:567','/works/OL123W'], ['rawg','game:1','1'], ['jikan','anime:1','1'], ['anilist','anime:2','2'], ['google-books','volume:abc_2','abc_2'], ['comic-vine','volume:3','3'], ['mangaupdates','series:4','4'], ['bgg','5','5'], ['fantlab','work:6','6'], ['roblox','universe:7:icon:current','7']]) assert.equal(parseSavedCoverSource(provider,id)?.externalId,expected);
  for (const [provider,id] of [['tmdb','movie:42:broken'], ['fantlab','edition:3'], ['bgg','bgg:5'], ['open-library','work:garbage'], ['rawg','game:1:asset']]) assert.equal(parseSavedCoverSource(provider,id),null);
});
function setup(enabled = true) {
  let calls = 0;
  const provider: MediaProvider = { code: 'tmdb', mediaTypes: ['film'], async getCoverCandidatesByTitleSource(input) { calls++; assert.equal(input.titleSource?.externalId,'42'); return [{ id: 'movie:42:/new.jpg', provider: 'tmdb', title: 'X', imageUrl: 'https://image.tmdb.org/t/p/original/new.jpg', sourcePageUrl: null }]; } };
  const resolve = createCoverRecoveryResolver(async () => ({ providers: [provider], settings: [{ mediaType: 'film', providerCode: 'tmdb', enabled, coverSearchEnabled: enabled, priority: 1 }], options: { candidateLimit: 5, tmdbResultScanLimit: 5, providerCredentials: { tmdb: { accessToken: 'test' } } } }));
  return {resolve, calls: () => calls};
}
test('exact asset recovery avoids provider APIs and respects disablement', async () => {
  const s=setup(); const result=await s.resolve(item,policy);
  assert.equal(result.kind,'candidate'); if(result.kind==='candidate') { assert.equal(result.exactImage,true); assert.equal(result.replacement,false); assert.equal(result.candidate.imageUrl,'https://image.tmdb.org/t/p/original/poster.jpg'); } assert.equal(s.calls(),0);
  assert.equal((await setup(false).resolve(item,policy)).kind,'skip');
});
test('specific asset replacement requires permission', async () => {
 const s=setup(); assert.equal((await s.resolve(item,{...policy,forceReplacement:true})).kind,'skip'); assert.equal(s.calls(),0);
 const r=await s.resolve(item,{...policy,forceReplacement:true,allowReplacement:true}); assert.equal(r.kind,'candidate'); if(r.kind==='candidate') assert.equal(r.replacement,true); assert.equal(s.calls(),1);
});
test('metadata fallback for existing and empty covers follows separate policies', async () => {
 const s=setup(); const noSource={...item,coverSourceProvider:null,coverSourceExternalId:null};
 assert.equal((await s.resolve(noSource,policy)).kind,'skip');
 assert.equal((await s.resolve(noSource,{...policy,allowReplacement:true})).kind,'candidate');
 const empty={...noSource,coverUrl:null}; assert.equal((await s.resolve(empty,policy)).kind,'skip');
 const r=await s.resolve(empty,{...policy,includeEmpty:true}); assert.equal(r.kind,'candidate'); if(r.kind==='candidate') assert.equal(r.replacement,false);
});
test('unsupported saved ID never becomes a work lookup without replacement', async()=> { const s=setup(); assert.equal((await s.resolve({...item,coverSourceExternalId:'movie:42:garbage'},policy)).kind,'skip'); assert.equal(s.calls(),0); });
test('work-only saved source permits its current cover by default',async()=> {const s=setup();const r=await s.resolve({...item,coverSourceExternalId:'movie:42'},policy);assert.equal(r.kind,'candidate');if(r.kind==='candidate'){assert.equal(r.replacement,false);assert.equal(r.exactImage,false);}assert.equal(s.calls(),1);});
test('quota refusal defers without contacting the provider',async()=> {
 let called=false; const resolve=createCoverRecoveryResolver(async()=>({providers:[{code:'jikan',mediaTypes:['anime'],async getCoverCandidatesByTitleSource(){called=true;return [];}}],settings:[],options:{candidateLimit:1,tmdbResultScanLimit:1,beforeProviderSearch:async()=> 'provider-daily-limit'}}));
 await assert.rejects(resolve({...item,mediaType:'anime',coverSourceProvider:'jikan',coverSourceExternalId:'anime:42',metadataSourceProvider:null},policy),(e:unknown)=>e instanceof Error && 'code' in e && e.code==='provider-daily-limit' && 'deferSeconds' in e && e.deferSeconds===3600); assert.equal(called,false);
});
test('provider transient failure is retryable and mismatched work IDs are rejected',async()=>{
 const runtime={settings:[],options:{candidateLimit:1,tmdbResultScanLimit:1}};
 const base={...item,mediaType:'anime',coverSourceProvider:'jikan',coverSourceExternalId:'anime:42',metadataSourceProvider:null};
 const fail=createCoverRecoveryResolver(async()=>({...runtime,providers:[{code:'jikan',mediaTypes:['anime'],async getCoverCandidatesByTitleSource(){throw new Error('network');}}]}));
 await assert.rejects(fail(base,policy),(e:unknown)=>e instanceof Error && 'retryable' in e && e.retryable===true);
 const wrong=createCoverRecoveryResolver(async()=>({...runtime,providers:[{code:'jikan',mediaTypes:['anime'],async getCoverCandidatesByTitleSource(){return [{id:'anime:99',provider:'jikan',title:'Wrong',imageUrl:'https://cdn.example/x.jpg',sourcePageUrl:null}];}}]}));
 assert.equal((await wrong(base,policy)).kind,'skip');
});
test('recovery cancellation reaches shared fetches and prevents publication',async()=> {
 const {fetchJson}=await import('../src/lib/covers/providers/shared');
 const controller=new AbortController(); let fetchSignal:AbortSignal|null|undefined;
 const originalFetch=globalThis.fetch;
 globalThis.fetch=async(_url,init)=>{fetchSignal=init?.signal; controller.abort(); fetchSignal?.throwIfAborted(); throw new Error('signal missing');};
 try {
 const resolve=createCoverRecoveryResolver(async()=>({providers:[{code:'jikan',mediaTypes:['anime'],async getCoverCandidatesByTitleSource(){await fetchJson(new URL('https://api.jikan.moe/v4/anime/42'));return [];}}],settings:[],options:{candidateLimit:1,tmdbResultScanLimit:1}}));
 await assert.rejects(resolve({...item,mediaType:'anime',coverSourceProvider:'jikan',coverSourceExternalId:'anime:42',metadataSourceProvider:null},{...policy,signal:controller.signal}),{name:'AbortError'});
 assert.equal((fetchSignal as AbortSignal | null | undefined)?.aborted,true);
 }finally{globalThis.fetch=originalFetch;}
});
test('recovery retries actual shared HTTP failures while legacy null behavior stays unchanged',async()=> {
 const {fetchJson}=await import('../src/lib/covers/providers/shared');
 const originalFetch=globalThis.fetch;let status=429;
 globalThis.fetch=async()=>new Response('failed',{status});
 const resolve=createCoverRecoveryResolver(async()=>({providers:[{code:'jikan',mediaTypes:['anime'],async getCoverCandidatesByTitleSource(){await fetchJson(new URL('https://api.jikan.moe/v4/anime/42'));return [];}}],settings:[],options:{candidateLimit:1,tmdbResultScanLimit:1}}));
 const target={...item,mediaType:'anime',coverSourceProvider:'jikan',coverSourceExternalId:'anime:42',metadataSourceProvider:null};
 try {
  assert.equal(await fetchJson(new URL('https://api.jikan.moe/v4/anime/42')),null);
  await assert.rejects(resolve(target,policy),(e:unknown)=>e instanceof Error && 'code' in e && e.code==='provider-rate-limit' && 'deferSeconds' in e && e.deferSeconds===60);
  status=503;await assert.rejects(resolve(target,policy),(e:unknown)=>e instanceof Error && 'code' in e && e.code==='provider-unavailable' && 'retryable' in e && e.retryable===true);
  for(status of [401,403,404,410]) assert.equal((await resolve(target,policy)).kind,'skip');
 }finally{globalThis.fetch=originalFetch;}
});
test('IGDB current-cover recovery preserves HTTP failures instead of silently returning no cover',async()=>{
 const {createIgdbProvider}=await import('../src/lib/covers/providers/igdb');
 const originalFetch=globalThis.fetch;
 globalThis.fetch=async()=>Response.json({access_token:'test-recovery-token',expires_in:3600});
 try {
 const provider=createIgdbProvider(async()=>new Response('unavailable',{status:503}));
 const options={candidateLimit:1,tmdbResultScanLimit:1,providerCredentials:{igdb:{clientId:'recovery-http-test',clientSecret:'test'}}};
 const resolve=createCoverRecoveryResolver(async()=>({providers:[provider],settings:[],options}));
 await assert.rejects(resolve({...item,mediaType:'game',coverSourceProvider:'igdb',coverSourceExternalId:'game:42',metadataSourceProvider:null},policy),(e:unknown)=>e instanceof Error && 'code' in e && e.code==='provider-unavailable' && 'retryable' in e && e.retryable===true);
 const candidates=await provider.getCoverCandidatesByTitleSource!({title:'X',originalTitle:null,mediaType:'game',releaseYear:null,titleSource:{provider:'igdb',externalId:'42'}},options);assert.deepEqual(candidates,[]);
 }finally{globalThis.fetch=originalFetch;}
});
