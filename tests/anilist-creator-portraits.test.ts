import assert from "node:assert/strict";
import test from "node:test";
import { parseAniListPersonImage } from "../src/lib/creators/anilist-person-image";
import { creatorProfileDescriptor, creatorProfileTargetFromBinding } from "../src/lib/providers/creator-profile-targets";
import { fetchCreatorProfileRaw, validateCreatorProfilePayload } from "../src/lib/providers/creator-profile-fetch";
import type { CreatorImageDependencies } from "../src/lib/creators/image-fill";
import type { JSONValue } from "../src/lib/providers/types";

const target = { provider: "anilist", resourceType: "person", externalId: "42" } as const;
const profile = { id:42, name:{full:"Director"}, image:{large:"https://s4.anilist.co/file/large.jpg",medium:"https://s4.anilist.co/file/medium.jpg"},siteUrl:"https://anilist.co/staff/42/Director" };
test("AniList portraits keep raw Staff shape and the exact image descriptor",()=>{
  assert.equal(creatorProfileTargetFromBinding({provider:'anilist',externalCreatorId:'studio:42'}),null);
  assert.deepEqual(creatorProfileTargetFromBinding({provider:'anilist',externalCreatorId:'person:42'}),target);
  assert.deepEqual(creatorProfileDescriptor(target),{providerCode:'anilist',resourceType:'person',externalId:'42',apiMethod:'staff.image',requestParams:{version:1}});
  assert.deepEqual(parseAniListPersonImage(profile,'42'),{urls:[profile.image.large,profile.image.medium],sourceUrl:'https://anilist.co/staff/42'});
  assert.deepEqual(parseAniListPersonImage({...profile,image:null},'42').urls,[]);
  assert.deepEqual(parseAniListPersonImage({...profile,image:{large:null,medium:null}},'42').urls,[]);
});
test("AniList rejects malformed profiles and untrusted portrait origins",()=>{
  for(const value of [{...profile,id:43},{...profile,name:'Director'},{...profile,image:{}},{...profile,image:'bad'},{id:42,name:{full:'Director'}},{...profile,siteUrl:'https://anilist.co/staff/43'},{...profile,siteUrl:'https://evil.test/staff/42'}]) {
    assert.throws(()=>validateCreatorProfilePayload(target,value as JSONValue));
  }
  for(const large of ['http://s4.anilist.co/image.jpg','https://evil.s4.anilist.co/image.jpg','https://s4.anilist.co.evil.test/image.jpg','https://user:secret@s4.anilist.co/image.jpg','https://s4.anilist.co:8443/image.jpg','file:///etc/passwd','not-url']) {
    assert.throws(()=>parseAniListPersonImage({...profile,image:{large}},'42'));
  }
});
test("explicit AniList Staff image fetch unwraps GraphQL and rejects partial data",async()=>{
  let calls=0;
  const result=await fetchCreatorProfileRaw(target,{signal:new AbortController().signal,credentials:{},requestStartedAt:async()=>new Date(1),anilistFetch:async(url,init,options)=>{
    await options?.beforeRequest?.();
    calls++; assert.equal(String(url),'https://graphql.anilist.co/');
    const body=JSON.parse(String(init?.body)); assert.deepEqual(body.variables,{id:42}); assert.match(body.query,/image \{ large medium \}/);
    return Response.json({data:{Staff:profile}});
  }});
  assert.equal(calls,1); assert.deepEqual(result.payload,profile); assert.equal(result.requestStartedAt.getTime(),1);
  await assert.rejects(fetchCreatorProfileRaw(target,{signal:new AbortController().signal,credentials:{},requestStartedAt:async()=>new Date(),anilistFetch:async()=>Response.json({errors:[{message:'partial'}],data:{Staff:profile}})}),/INVALID_CREATOR_PROFILE_RESPONSE/);
});
const serviceTest=process.env.NODE_PATH ? test : test.skip;
serviceTest("AniList image fill uses cached profiles, preserves manual images and rejects a concurrent avatar",async()=>{
  const {fillCreatorImage}=await import('../src/lib/creators/image-fill');
  type State=Awaited<ReturnType<NonNullable<CreatorImageDependencies['state']>>>;
  let state=[{typeCode:'person',creator:{avatarObjectKey:null,avatarSource:null,avatarVersion:1}}] as State;
  const calls:string[]=[];
  const deps:CreatorImageDependencies={state:async()=>state,bindings:async()=>[{id:1,provider:'anilist',externalCreatorId:'person:42'}] as never,
    fetchProfile:async(_target,options)=>{assert.equal(options.onlyMissing,true);calls.push('profile');return {id:7,payloadHash:'hash',payload:profile} as never;},
    attach:async()=>{calls.push('attach');},fetchImage:async()=>{calls.push('download');return {ok:true,body:Buffer.from('image'),contentType:'image/jpeg'};},
    portrait:async()=>Buffer.from('webp'),upload:async()=>({objectKey:'new.webp'}),commit:async input=>{assert.equal(input.target.provider,'anilist');assert.equal(input.binding.externalCreatorId,'person:42');return true;},cleanup:async()=>{}};
  assert.equal(await fillCreatorImage(1,new AbortController().signal,{},deps),'stored');
  state=[{...state[0],creator:{...state[0].creator,avatarObjectKey:'manual.webp',avatarSource:'manual'}}] as State;
  const before=calls.length;
  assert.equal(await fillCreatorImage(1,new AbortController().signal,{},deps),'already-present');assert.equal(calls.length,before);
  state=[{...state[0],creator:{...state[0].creator,avatarObjectKey:null,avatarSource:null}}] as State;
  deps.fetchProfile=async()=>{state=[{...state[0],creator:{...state[0].creator,avatarVersion:2,avatarObjectKey:'race.webp',avatarSource:'manual'}}] as State;return {id:7,payloadHash:'hash',payload:profile} as never;};
  assert.equal(await fillCreatorImage(1,new AbortController().signal,{},deps),'source-changed');assert.equal(calls.filter(c=>c==='download').length,1);
});

test("full anime capture preserves optional portrait evidence and the complete response",async()=>{
  const {fetchAniListCreatorPayload}=await import('../src/lib/providers/anilist-creators-fetch');
  const originalFetch=global.fetch;
  const node={id:42,name:{full:'Director'},image:profile.image,siteUrl:profile.siteUrl};
  const raw={data:{Media:{id:7,idMal:8,staff:{pageInfo:{currentPage:1,hasNextPage:false},edges:[{role:'Director',node}]},studios:{pageInfo:{hasNextPage:false},nodes:[]}}}};
  global.fetch=async(_url,init)=>{
    assert.match(String(init?.body),/image \{ large medium \}/); assert.match(String(init?.body),/siteUrl/);
    return Response.json(raw);
  };
  try {
    const result=await fetchAniListCreatorPayload({externalId:'7'},{},{request:async(url,init)=>fetch(url,init)});
    assert.deepEqual(result?.staff,[{id:42,name:'Director',role:'Director',image:profile.image,siteUrl:profile.siteUrl}]);
    assert.deepEqual(result?.responses,[raw]);
  } finally {global.fetch=originalFetch;}
});
