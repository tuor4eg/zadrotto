import assert from 'node:assert/strict';
import test from 'node:test';
import { createPlatformProviderApi, parseIgdbPlatformProfiles, parseRawgPlatformProfiles } from '../src/lib/platforms/provider-api';
import { parsePlatformLogoSyncPayload } from '../src/lib/platforms/logo-sync-model';

const options={providerCredentials:{igdb:{clientId:'client',clientSecret:'secret'},rawg:{apiKey:'key'}}};
test('IGDB platform identity and logo image IDs remain separate; logo-less platforms are complete evidence',()=>{
  assert.deepEqual(parseIgdbPlatformProfiles([{id:6,name:' PC (Windows) ',platform_logo:{id:99,image_id:'pl_logo'}}])[0],{
    provider:'igdb',externalId:'6',name:'PC (Windows)',normalizedName:'pc (windows)',sourceUrl:null,imageId:'pl_logo',imageUrl:'https://images.igdb.com/igdb/image/upload/t_original/pl_logo.png',
  });
  assert.equal(parseIgdbPlatformProfiles([{id:3,name:'Linux'}])[0].imageId,null);
  assert.throws(()=>parseIgdbPlatformProfiles([{id:3,name:'Linux',platform_logo:99}]));
  assert.throws(()=>parseIgdbPlatformProfiles([{id:0,name:'Broken'}]));
});
test('RAWG backgrounds never become logos; only safe explicit image fields are candidates',()=>{
  const [background,logo]=parseRawgPlatformProfiles([{id:4,name:'PC',image_background:'https://media.rawg.io/game.jpg'},{id:5,name:'macOS',slug:'macos',image:'https://media.rawg.io/platform.png'}]);
  assert.equal(background.imageUrl,null);
  assert.equal(logo.imageUrl,'https://media.rawg.io/platform.png');
  assert.equal(parseRawgPlatformProfiles([{id:6,name:'Linux',image:'http://127.0.0.1/private'}])[0].imageUrl,null);
});
test('catalogue pages use shared budget admission and resume a stable IGDB keyset',async()=>{
  const calls:Array<{provider:string;body:string;backfill:boolean|undefined}>=[];
  const api=createPlatformProviderApi({token:async()=>'token',fetchProvider:async(provider,_url,init,backfill)=>{
    calls.push({provider,body:String(init?.body),backfill});
    return Response.json([{id:6,name:'PC (Windows)'}]);
  }});
  assert.equal((await api.fetchCataloguePage('igdb',3,options)).profiles[0].externalId,'6');
  assert.match(calls[0].body,/where id > 3; sort id asc; limit 500;/);
  assert.equal(calls[0].backfill,true);
  await assert.rejects(api.fetchIgdbProfiles(Array.from({length:101},(_,index)=>String(index+1)),options));
});
test('RAWG pagination never follows a provider supplied next URL',async()=>{
  const urls:string[]=[];
  const api=createPlatformProviderApi({fetchProvider:async(_provider,url)=>{
    urls.push(String(url));
    return Response.json({results:[{id:4,name:'PC'}],next:'http://127.0.0.1/private'});
  }});
  assert.equal((await api.fetchCataloguePage('rawg',1,options)).nextCursor,2);
  assert.equal(new URL(urls[0]).origin,'https://api.rawg.io');
  assert.equal(new URL(urls[0]).searchParams.get('page_size'),'40');
});
test('sync payload accepts manual options and rejects malformed checkpoints',()=>{
  assert.deepEqual(parsePlatformLogoSyncPayload({platformId:2,force:true}),{platformId:2,force:true});
  for(const value of [null,[],{platformId:-1},{force:'yes'},{checkpoint:{stage:'complete'}},{automatic:true}]) assert.throws(()=>parsePlatformLogoSyncPayload(value),{code:'invalid-payload'});
});

test('known platform IDs request only provider detail endpoints',async()=>{
  const calls:Array<{provider:string;url:string;body:unknown}>=[];
  const api=createPlatformProviderApi({token:async()=> 'token',fetchProvider:async(provider,url,init)=>{
    calls.push({provider,url:String(url),body:init?.body});
    return new Response(JSON.stringify(provider==='igdb'?[{id:9,name:'PlayStation 3',platform_logo:{image_id:'ps3-logo'}}]:{id:16,name:'PlayStation 3',image_background:'https://media.rawg.io/media/games/background.jpg'}),{status:200});
  }});
  const options={providerCredentials:{igdb:{clientId:'id',clientSecret:'secret'},rawg:{apiKey:'key'}}};
  const igdb=await api.fetchProfiles('igdb',['9'],options);
  const rawg=await api.fetchProfiles('rawg',['16'],options);
  assert.equal(igdb[0].externalId,'9');assert.equal(igdb[0].imageId,'ps3-logo');
  assert.match(String(calls[0].body),/where id = \(9\)/);
  assert.match(calls[1].url,/\/api\/platforms\/16\?/);
  assert.equal(rawg[0].imageUrl,null,'game backgrounds are not platform images');
});
