import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { test } from "node:test";
import { sql } from "drizzle-orm";
const testUrl=process.env.PLATFORM_LOGOS_TEST_DATABASE_URL;
test("platform asset identity and logo lifecycle uses cached evidence without changing game links",{skip:!testUrl},async(t)=>{
 const schema=`platform_logos_${Date.now()}`;
 const url=new URL(testUrl!);url.searchParams.set("options",`-c search_path=${schema}`);
 process.env.DATABASE_URL=url.toString();process.env.DATABASE_MAX_CONNECTIONS="3";
 const {getDbClient,db}=await import("../src/db");const client=getDbClient();
 const requests=await import("../src/db/queries/platform-logo-requests");
 const logos=await import("../src/db/queries/platform-logos");
 const {platforms}=await import("../src/db/schema");
 const previousFetch=globalThis.fetch;let networkCalls=0;
 globalThis.fetch=async()=>{networkCalls++;throw new Error("Unexpected API call during local moderation");};
 try {
    await client.unsafe(`CREATE SCHEMA ${schema}`);
    await client.unsafe(`CREATE TABLE media_types(code text PRIMARY KEY,name text); INSERT INTO media_types VALUES('game','Игра'),('film','Фильм');
      CREATE TABLE admin_users(id integer PRIMARY KEY); INSERT INTO admin_users VALUES(1);
      CREATE TABLE media_items(id integer PRIMARY KEY,code text,title text,media_type text,publication_status text DEFAULT 'published');
      INSERT INTO media_items VALUES(1,'one','Один','game','published'),(2,'two','Два','game','published'),(3,'film','Фильм','film','published');
      CREATE TABLE media_item_metadata(media_item_id integer PRIMARY KEY REFERENCES media_items(id),facts jsonb NOT NULL DEFAULT '{}',source_provider text,
        source_external_id text,source_url text,fetched_at timestamptz,created_at timestamptz DEFAULT now(),updated_at timestamptz DEFAULT now());
      INSERT INTO media_item_metadata(media_item_id,source_provider,facts) VALUES(1,'igdb','{"platforms":["PC (Microsoft Windows)","Linux","Xbox Series X|S"]}');
      CREATE TABLE admin_activity_logs(id serial PRIMARY KEY,created_at timestamptz DEFAULT now(),actor_type text,admin_user_id integer,
        author_id integer,action text,entity_type text,entity_id integer,entity_label text,status text,severity text,message text,ip_address text,user_agent text,metadata jsonb);
      CREATE TABLE job_runs(id serial PRIMARY KEY,job_id integer,retry_of_run_id integer,created_by_admin_id integer,type text,payload jsonb DEFAULT '{}',
        source text,status text DEFAULT 'queued',scheduled_for timestamptz,available_at timestamptz,attempts integer DEFAULT 0,max_attempts integer,
        timeout_seconds integer,retry_base_seconds integer,retry_max_seconds integer,locked_at timestamptz,locked_by text,lock_token text,
        lock_expires_at timestamptz,started_at timestamptz,finished_at timestamptz,cancelled_at timestamptz,error_code text,error_message text,
        created_at timestamptz DEFAULT now(),updated_at timestamptz DEFAULT now());
      CREATE TABLE domain_events(id uuid PRIMARY KEY DEFAULT gen_random_uuid(),type text NOT NULL,schema_version integer NOT NULL DEFAULT 1,
        actor_author_id integer,aggregate_type text NOT NULL,aggregate_id text NOT NULL,payload jsonb NOT NULL DEFAULT '{}',occurred_at timestamptz NOT NULL DEFAULT now());
      CREATE TABLE domain_event_outbox(event_id uuid PRIMARY KEY REFERENCES domain_events(id),dispatched_at timestamptz,created_at timestamptz DEFAULT now(),updated_at timestamptz DEFAULT now());`);
    for (const file of ["0120_normalized_platforms.sql", "0121_platform_initial_mappings.sql", "0122_platform_backfill.sql", "0126_platform_logos.sql"]) {
      const before=file==="0126_platform_logos.sql"?await client`select 'platform' kind,id,slug value,name from platforms union all select 'mapping',id,provider,external_platform_name from provider_platform_mappings order by kind,id`:null;
      await client.begin(async tx => {
        for (const statement of readFileSync(`drizzle/${file}`, "utf8").replaceAll('"public".', `"${schema}".`).split("--> statement-breakpoint")) await tx.unsafe(statement);
      });
      if(before)assert.deepEqual(await client`select 'platform' kind,id,slug value,name from platforms union all select 'mapping',id,provider,external_platform_name from provider_platform_mappings order by kind,id`,before,"0126 must not create or rename platforms and bindings");
    }
  const baselineLinks=await client`select media_item_id,platform_id,provider,is_manual,created_at::text,updated_at::text from media_item_platforms order by media_item_id,platform_id`;
  const initialPc=(await client`select * from platforms where slug='pc'`)[0];
  assert.equal(initialPc.logo_mode,'exact','schema migration does not rewrite existing platform data');
  const platform=async(name:string)=>Number((await client`insert into platforms(slug,name) values(${name.toLowerCase().replaceAll(' ','-')},${name}) returning id`)[0].id);
  const profile=async(provider:string,id:string,name:string,imageKey:string|null=null)=>{
   await client`insert into platform_provider_profiles(provider,external_id,name,normalized_name,image_id,image_url,image_key,image_object_key,image_content_hash)
    values(${provider},${id},${name},${name.toLowerCase()},${provider==='igdb'?imageKey:null},${provider==='rawg'?imageKey:null},${imageKey},${imageKey?`avatars/platform-providers/${provider}/${id}/${'a'.repeat(64)}.webp`:null},${imageKey?'a'.repeat(64):null})`;
  };
  const mapping=async(id:number,provider:string,name:string,externalId:string|null=null)=>Number((await client`insert into provider_platform_mappings(provider,media_type,external_platform_name,normalized_external_platform_name,platform_id,external_platform_id)
   values(${provider},'game',${name},${name.toLowerCase()},${id},${externalId}) returning id`)[0].id);
  const rows=async(id:number,kind:string)=>(await client`select * from platform_requests where target_platform_id=${id} and kind=${kind} order by id`);
  const apply=async(value:{requestId:number;jobRunId:number})=>{
   await requests.applyPlatformAssetRequest(value.requestId,{jobRunId:value.jobRunId});
   await client`update job_runs set status='succeeded' where id=${value.jobRunId}`;
  };
  const runApproved=async(id:number,kind:string)=>{
   for(const row of await rows(id,kind))if(row.apply_status==='applying')await apply({requestId:row.id,jobRunId:row.job_run_id});
  };
  const visible=async(id:number)=>(await db.select({key:logos.eligibleImportedPlatformLogoSql()}).from(platforms).where(sql`${platforms.id}=${id}`))[0]?.key;
  const setHash=async(provider:string,id:string,char:string)=>client`update platform_provider_profiles set image_content_hash=${char.repeat(64)},image_object_key=${`avatars/platform-providers/${provider}/${id}/${char.repeat(64)}.webp`} where provider=${provider} and external_id=${id}`;
  const choose=async(requestId:number,candidateKey:string)=>apply(await requests.resolvePlatformAssetRequest({requestId,adminId:1,decision:'map',candidateKey}));
  let exact=0,exactRequest=0;
  await t.test('missing IDs resolve exact cached names without editorial requests or canonical changes',async()=>{
   exact=await platform('Exact Console');await profile('igdb','700001','Exact Console','logo-one');
   const mid=await mapping(exact,'igdb','Exact Console');
   const canonical=await client`select id,slug,name from platforms order by id`;
   const mappingsBefore=await client`select id,platform_id,external_platform_name from provider_platform_mappings order by id`;
   assert.deepEqual(await requests.resolveMissingPlatformProviderIds(exact),{resolved:1,missing:0,ambiguous:0});
   assert.deepEqual(await requests.resolveMissingPlatformProviderIds(exact),{resolved:0,missing:0,ambiguous:0});
   assert.equal((await client`select external_platform_id from provider_platform_mappings where id=${mid}`)[0].external_platform_id,'700001');
   assert.equal((await rows(exact,'logo')).length,0);
   assert.equal((await client`select count(*)::int n from platform_requests where target_platform_id=${exact}`)[0].n,0);
   assert.deepEqual(await client`select id,slug,name from platforms order by id`,canonical);
   assert.deepEqual(await client`select id,platform_id,external_platform_name from provider_platform_mappings order by id`,mappingsBefore);
   await requests.proposePlatformLogoRequests(exact,1);assert.equal((await rows(exact,'logo')).length,1);
   assert.equal((await requests.autoApprovePlatformAssetRequests(exact,1)).approved,1);await runApproved(exact,'logo');
   exactRequest=(await rows(exact,'logo'))[0].id;assert.ok(await visible(exact));
  });
  await t.test('missing or ambiguous names create no ID requests and confirmed IDs stay untouched',async()=>{
   const id=await platform('Ambiguous Console');await profile('igdb','700002','Ambiguous Console');await profile('igdb','700003','Ambiguous Console');
   await mapping(id,'igdb','Ambiguous Console');await mapping(id,'rawg','Missing Console');
   const confirmed=await mapping(id,'igdb','Confirmed Different Name','700001');
   assert.deepEqual(await requests.resolveMissingPlatformProviderIds(id),{resolved:0,missing:1,ambiguous:1});
   await requests.resolveMissingPlatformProviderIds(id);
   assert.equal((await client`select count(*)::int n from platform_requests where target_platform_id=${id}`)[0].n,0);
   assert.equal((await client`select external_platform_id from provider_platform_mappings where id=${confirmed}`)[0].external_platform_id,'700001');
  });
  await t.test('PC remains one combined platform with separate Windows and Linux IDs; grouped selection is manual',async()=>{
   await profile('igdb','700004','Windows logo fixture','windows');await profile('igdb','700005','Linux logo fixture','linux');await setHash('igdb','700005','b');
   await mapping(initialPc.id,'igdb','Windows logo fixture');await mapping(initialPc.id,'igdb','Linux logo fixture');
   await requests.resolveMissingPlatformProviderIds(initialPc.id);
   const ids=await client`select distinct external_platform_id from provider_platform_mappings where platform_id=${initialPc.id} and external_platform_id is not null order by external_platform_id`;
   assert.deepEqual(ids.map(row=>row.external_platform_id),['700004','700005']);
   await requests.proposePlatformLogoRequests(initialPc.id,1);const [request]=await rows(initialPc.id,'logo');assert.equal(request.proposal.candidates.length,2);
   assert.equal((await requests.autoApprovePlatformAssetRequests(initialPc.id,1)).approved,0);
   await choose(request.id,request.proposal.candidates.find((row:{externalId:string})=>row.externalId==='700005').key);assert.ok(await visible(initialPc.id));
   assert.equal((await logos.getPlatformLogoState(initialPc.id))!.logoMode,'exact','source platform grouping does not change canonical mode automatically');
  });
  await t.test('one image deduplicates across aliases and providers; distinct RAWG image makes one manual group',async()=>{
   const id=await platform('Cross Provider');await profile('igdb','700006','Cross Provider IGDB','igdb-image');await profile('rawg','700007','Cross Provider RAWG','rawg-image');
   await mapping(id,'igdb','Cross Provider IGDB','700006');await mapping(id,'rawg','Cross Provider RAWG','700007');
   await requests.proposePlatformLogoRequests(id,1);let group=(await rows(id,'logo'))[0];assert.equal(group.proposal.candidates.length,1);
   assert.equal((await requests.autoApprovePlatformAssetRequests(id,1)).approved,1);await runApproved(id,'logo');const oldKey=await visible(id);
   await setHash('rawg','700007','c');await requests.proposePlatformLogoRequests(id,1);group=(await rows(id,'logo')).at(-1)!;assert.equal(group.proposal.candidates.length,2);
   assert.equal((await client`select count(*)::int n from platform_requests where target_platform_id=${id} and kind='logo' and not superseded`)[0].n,1);
   assert.equal((await requests.autoApprovePlatformAssetRequests(id,1)).approved,0);assert.equal(await visible(id),oldKey);
   await choose(group.id,group.proposal.candidates.find((row:{provider:string})=>row.provider==='rawg').key);
   assert.equal((await logos.getPlatformLogoState(id))!.importedLogoProvider,'rawg');
   const rawg=await platform('RAWG Only');await profile('rawg','700008','RAWG Only','rawg-only');await mapping(rawg,'rawg','RAWG Only','700008');await requests.proposePlatformLogoRequests(rawg,1);
   assert.equal((await requests.autoApprovePlatformAssetRequests(rawg,1)).approved,0);const [rawgRequest]=await rows(rawg,'logo');await choose(rawgRequest.id,rawgRequest.proposal.candidates[0].key);assert.ok(await visible(rawg));
  });
  await t.test('rejected unchanged candidate set never repeats across versions; changed set creates one new request',async()=>{
   const id=await platform('Rejected Set');await profile('igdb','700009','Rejected Set','rejected');await mapping(id,'igdb','Rejected Set','700009');
   await requests.proposePlatformLogoRequests(id,1);const [request]=await rows(id,'logo');await apply(await requests.resolvePlatformAssetRequest({requestId:request.id,adminId:1,decision:'exclude'}));
   const version=(await logos.getPlatformLogoState(id))!.logoVersion;await logos.setPlatformLogoMode({platformId:id,expectedVersion:version,mode:'combined'});await logos.setPlatformLogoMode({platformId:id,expectedVersion:version+1,mode:'exact'});
   await requests.proposePlatformLogoRequests(id,1);assert.equal((await rows(id,'logo')).length,1);
   await setHash('igdb','700009','d');await requests.proposePlatformLogoRequests(id,1);await requests.proposePlatformLogoRequests(id,1);assert.equal((await rows(id,'logo')).length,2);
  });
  await t.test('multiple distinct source IDs require a choice even when only one source has a logo; no-image groups disappear',async()=>{
   const id=await platform('Merged Sources');
   await profile('igdb','700020','Source One','first-source');await profile('igdb','700021','Source Two');
   await mapping(id,'igdb','Source One','700020');await mapping(id,'igdb','Source Two','700021');
   await requests.proposePlatformLogoRequests(id,1);
   const [request]=await rows(id,'logo');assert.equal(request.proposal.candidates.length,1);
   assert.equal((await requests.autoApprovePlatformAssetRequests(id,1)).approved,0);
   await client`update platform_provider_profiles set is_available=false where external_id in ('700020','700021')`;
   await requests.proposePlatformLogoRequests(id,1);
   assert.equal((await client`select count(*)::int n from platform_requests where target_platform_id=${id} and kind='logo' and not superseded`)[0].n,0);
  });
  await t.test('without-logo decision removes an old imported choice but preserves manual images',async()=>{
   const id=await platform('Remove Imported');
   await profile('igdb','700022','Remove Imported','remove');await mapping(id,'igdb','Remove Imported','700022');
   await requests.proposePlatformLogoRequests(id,1);await requests.autoApprovePlatformAssetRequests(id,1);await runApproved(id,'logo');assert.ok(await visible(id));
   await setHash('igdb','700022','f');await requests.proposePlatformLogoRequests(id,1);
   const request=(await rows(id,'logo')).at(-1)!;assert.ok(await visible(id),'new proposal does not clear previous choice');
   await apply(await requests.resolvePlatformAssetRequest({requestId:request.id,adminId:1,decision:'exclude'}));assert.equal(await visible(id),null);
  });
  await t.test('current candidate and manual version are revalidated at queued apply; unknown keys are rejected',async()=>{
   const id=await platform('Candidate Race');await profile('igdb','700010','Candidate Race','race');await mapping(id,'igdb','Candidate Race','700010');await requests.proposePlatformLogoRequests(id,1);
   const [request]=await rows(id,'logo');await assert.rejects(choose(request.id,'unknown-candidate'));
   const queued=await requests.resolvePlatformAssetRequest({requestId:request.id,adminId:1,decision:'map',candidateKey:request.proposal.candidates[0].key});
   await setHash('igdb','700010','e');await assert.rejects(requests.applyPlatformAssetRequest(request.id,{jobRunId:queued.jobRunId}));await client`update job_runs set status='failed' where id=${queued.jobRunId}`;assert.equal(await visible(id),null);
   const stale=await platform('Manual Race');await profile('igdb','700011','Manual Race','manual-race');await mapping(stale,'igdb','Manual Race','700011');await requests.proposePlatformLogoRequests(stale,1);const [staleRequest]=await rows(stale,'logo');
   const staleQueued=await requests.resolvePlatformAssetRequest({requestId:staleRequest.id,adminId:1,decision:'map',candidateKey:staleRequest.proposal.candidates[0].key});
   await logos.setManualPlatformLogo({platformId:stale,expectedVersion:0,objectKey:`logos/platforms/${stale}/00000000-0000-4000-8000-000000000001.webp`,contentHash:'b'.repeat(64)});
   await assert.rejects(requests.applyPlatformAssetRequest(staleRequest.id,{jobRunId:staleQueued.jobRunId}));assert.ok((await logos.getPlatformLogoState(stale))!.manualLogoObjectKey);await client`update job_runs set status='failed' where id=${staleQueued.jobRunId}`;
  });
  await t.test('no images means no logo request; one combined image still requires manual approval',async()=>{
   const id=await platform('No Images');await profile('igdb','700012','No Images');await mapping(id,'igdb','No Images','700012');await requests.proposePlatformLogoRequests(id,1);assert.equal((await rows(id,'logo')).length,0);
   const combined=await platform('Combined One');await logos.setPlatformLogoMode({platformId:combined,expectedVersion:0,mode:'combined'});await profile('igdb','700013','Combined One','one');await mapping(combined,'igdb','Combined One','700013');await requests.proposePlatformLogoRequests(combined,1);
   assert.equal((await requests.autoApprovePlatformAssetRequests(combined,1)).approved,0);const [request]=await rows(combined,'logo');await choose(request.id,request.proposal.candidates[0].key);assert.ok(await visible(combined));
  });
  await t.test('cached choice survives provider disappearance; manual image wins; reopen and exclude are idempotent',async()=>{
   await client`update platform_provider_profiles set image_id=null,image_url=null,is_available=false where provider='igdb' and external_id='700001'`;assert.ok(await visible(exact));
   const state=await logos.getPlatformLogoState(exact);const manualKey=`logos/platforms/${exact}/00000000-0000-4000-8000-000000000002.webp`;
   await logos.setManualPlatformLogo({platformId:exact,expectedVersion:state!.logoVersion,objectKey:manualKey,contentHash:'c'.repeat(64)});
   await assert.rejects(logos.clearManualPlatformLogo({platformId:exact,expectedVersion:state!.logoVersion}));
   const {resolvePlatformLogoUrl}=await import('../src/lib/platforms/logo-url');assert.ok(resolvePlatformLogoUrl({...await logos.getPlatformLogoState(exact),manualLogoObjectKey:manualKey,logoMode:'exact',importedLogoObjectKey:await visible(exact)})!.includes('00000000'));
   const reopened=await requests.reopenPlatformAssetRequest({requestId:exactRequest,adminId:1});await apply(reopened);await requests.applyPlatformAssetRequest(exactRequest,{jobRunId:reopened.jobRunId});assert.equal(await visible(exact),null);
   const excluded=await requests.resolvePlatformAssetRequest({requestId:exactRequest,adminId:1,decision:'exclude'});await apply(excluded);assert.deepEqual(await requests.applyPlatformAssetRequest(exactRequest,{jobRunId:excluded.jobRunId}),{processed:0});assert.ok((await logos.getPlatformLogoState(exact))!.manualLogoObjectKey);
  });
  await t.test('legacy mapping requests still resolve and apply; logo changes leave existing game links untouched',async()=>{
   const legacy=await import('../src/db/queries/platform-requests');const id=await platform('Legacy Choice');
   const [request]=await client`insert into platform_requests(provider,media_type,external_platform_name,normalized_external_platform_name) values('igdb','game','Legacy external','legacy external') returning id`;
   const decision=await legacy.resolvePlatformRequest({requestId:request.id,adminId:1,decision:'map',platformIds:[id]});await legacy.applyPlatformRequest(request.id,{jobRunId:decision.jobRunId});
   assert.equal((await client`select platform_id from provider_platform_mappings where normalized_external_platform_name='legacy external'`)[0].platform_id,id);
   assert.deepEqual(await client`select media_item_id,platform_id,provider,is_manual,created_at::text,updated_at::text from media_item_platforms order by media_item_id,platform_id`,baselineLinks);assert.equal(networkCalls,0);
  });
  await t.test('representative EXPLAIN at 10k platforms and 100k mappings/requests',{skip:!process.env.PLATFORM_LOGOS_PERF},async()=>{
   const fixture=`insert into platforms(id,slug,name,imported_logo_provider,imported_logo_external_id,imported_logo_image_key,imported_logo_object_key)
    select 1000000+g,'perf-'||g,'Perf '||lpad(g::text,5,'0'),'igdb',(800000+g)::text,'perf-image-'||g,'avatars/platform-providers/igdb/'||(800000+g)::text||'/'||repeat('a',64)||'.webp' from generate_series(1,10000) g; analyze platforms;
    insert into platform_provider_profiles(provider,external_id,name,normalized_name,image_key,image_object_key,image_content_hash)
    select 'igdb',(800000+g)::text,'Perf Platform '||g,'perf platform '||g,'perf-image-'||g,'avatars/platform-providers/igdb/'||(800000+g)::text||'/'||repeat('a',64)||'.webp',repeat('a',64) from generate_series(1,100000) g; analyze platform_provider_profiles;
    insert into provider_platform_mappings(provider,media_type,external_platform_name,normalized_external_platform_name,platform_id,external_platform_id)
    select 'igdb','game','Perf Platform '||g,'perf platform '||g,1000001+(g-1)%10000,(800000+g)::text from generate_series(1,100000) g;
    insert into platform_requests(provider,media_type,external_platform_name,normalized_external_platform_name,kind,target_platform_id,proposal_key,proposal,decision,resolved_at,apply_status)
    select 'igdb','game','Perf Platform '||g,'perf platform '||g,'logo',1000001+(g-1)%10000,'perf-key-'||g,
      jsonb_build_object('provider','igdb','externalId',(800000+g)::text,'imageKey','perf-image-'||g,'objectKey','avatars/platform-providers/igdb/'||(800000+g)::text||'/'||repeat('a',64)||'.webp'),'map',now(),'processed' from generate_series(1,100000) g;
    insert into media_items(id,code,title,media_type,publication_status) select 1000000+g,'perf-item-'||g,'Perf Item '||g,'game','published' from generate_series(1,10000) g;
    insert into media_item_platforms(media_item_id,platform_id,provider) select 1000000+g,1000000+g,'igdb' from generate_series(1,10000) g;
    analyze platforms;analyze platform_provider_profiles;analyze provider_platform_mappings;analyze platform_requests;analyze media_items;analyze media_item_platforms;`;
   await client`set statement_timeout=120000`;
   for(const statement of fixture.split(";").filter(row=>row.trim())){const started=Date.now();await client.unsafe(statement);t.diagnostic(`fixture ${statement.trim().slice(0,65)}: ${Date.now()-started}ms`); }
   const counts=(await client`select (select count(*) from platforms)::int platforms,(select count(*) from provider_platform_mappings)::int mappings,(select count(*) from platform_requests)::int requests`)[0];
   assert.ok(counts.platforms>=10000 && counts.mappings>=100000 && counts.requests>=100000);
   const eligible=db.select({id:platforms.id,key:logos.eligibleImportedPlatformLogoSql()}).from(platforms).where(sql`${platforms.id}>=1000000`).toSQL();
   // Generate the public catalogue shape through Drizzle so the eligibility expression stays identical.
   const {mediaItems,mediaItemPlatforms}=await import('../src/db/schema');
   const {eq,and}=await import('drizzle-orm');
   const publicQuery=db.select({id:platforms.id,slug:platforms.slug,name:platforms.name,key:logos.eligibleImportedPlatformLogoSql(),count:sql`count(${mediaItems.id})::int`})
    .from(platforms).innerJoin(mediaItemPlatforms,eq(mediaItemPlatforms.platformId,platforms.id)).innerJoin(mediaItems,eq(mediaItems.id,mediaItemPlatforms.mediaItemId))
    .where(and(eq(platforms.isActive,true),eq(mediaItems.publicationStatus,'published'),eq(mediaItems.mediaType,'game'))).groupBy(platforms.id).toSQL();
   const cachedNames=Array.from({length:50},(_,i)=>`perf platform ${i+1}`);
   const selectedPlatform=db.select({id:platforms.id,slug:platforms.slug,name:platforms.name,
    logoMode:platforms.logoMode,manualLogoObjectKey:platforms.manualLogoObjectKey,importedLogoObjectKey:logos.eligibleImportedPlatformLogoSql()})
    .from(platforms).where(and(eq(platforms.slug,'perf-1'),eq(platforms.isActive,true))).limit(1).toSQL();
   const queries=[
    {label:'archive-selected-platform',query:selectedPlatform.sql,params:selectedPlatform.params},
    {label:'cached-profile-names-50',query:'select * from platform_provider_profiles where provider=any($1::text[]) and is_available=true and normalized_name=any($2::text[])',params:[['igdb','rawg'],cachedNames]},
    {label:'all-10k-eligible-logos',query:eligible.sql,params:eligible.params},
    {label:'public-catalogue-10k',query:publicQuery.sql,params:publicQuery.params},
   ];
   for(const {label,query,params} of queries){
    const result=await client.unsafe('explain (analyze,buffers,format json) '+query,params as never[]);
    const plan=result[0]['QUERY PLAN'][0];
    const nodes:Array<{node:string;index?:string;loops:number;rows:number;time:number}>=[];
    const walk=(node:Record<string,unknown>)=>{nodes.push({node:String(node['Node Type']),...(node['Index Name']?{index:String(node['Index Name'])}:{}),loops:Number(node['Actual Loops']),rows:Number(node['Actual Rows']),time:Number(node['Actual Total Time'])});for(const child of (node.Plans??[]) as Record<string,unknown>[])walk(child);};
    walk(plan.Plan);t.diagnostic(JSON.stringify({label,counts,executionMs:plan['Execution Time'],planningMs:plan['Planning Time'],nodes}));
    assert.ok(Number.isFinite(plan['Execution Time']));
    if(label==='cached-profile-names-50')assert.ok(nodes.some(node=>node.index==='platform_provider_profiles_name_idx'));
    else if(!label.startsWith('cached-'))assert.ok(nodes.some(node=>node.index==='platform_requests_logo_evidence_idx'),'eligibility evidence must use the partial lookup index');
   }
  });
 }finally{globalThis.fetch=previousFetch;await client.unsafe(`drop schema if exists ${schema} cascade`);await client.end();}
});
