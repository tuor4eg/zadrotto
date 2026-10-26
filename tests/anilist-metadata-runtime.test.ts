import { readFileSync } from "node:fs";
import assert from "node:assert/strict";
import test from "node:test";
import postgres from "postgres";
import { describeAniListCreators } from "../src/lib/providers/anilist-creators-adapter";
import { snapshotHash } from "../src/lib/providers/snapshot-values";

const testUrl = process.env.ANILIST_METADATA_TEST_DATABASE_URL;
test("AniList metadata upsert attaches evidence before composition and preserves metadata-only edits", {skip: !testUrl}, async (t) => {
  const schema = `anilist_metadata_${process.pid}_${Date.now()}`;
  const url = new URL(testUrl!); url.searchParams.set("options", `-c search_path=${schema},public`);
  process.env.DATABASE_URL = url.toString();
  const admin = postgres(testUrl!, {max:1,onnotice:()=>undefined});
  const {dbClient} = await import("../src/db");
  const {upsertMediaItemMetadata} = await import("../src/db/queries/media-item-metadata");
  try {
    await admin.unsafe(`create schema ${schema}; set search_path=${schema},public`);
    // Clone the migrated integration schema so ancillary genre/platform queries stay isolated too.
    const tables = await admin<{tablename:string}[]>`select tablename from pg_tables where schemaname='public'`;
    for (const {tablename} of tables) await admin.unsafe(`create unlogged table ${schema}."${tablename.replaceAll('"','""')}" (like public."${tablename.replaceAll('"','""')}" including all)`);
    for (const statement of readFileSync("drizzle/0146_anilist_creator_portraits.sql", "utf8").split("--> statement-breakpoint")) await admin.unsafe(statement);
    await admin.unsafe(`create sequence creators_id_seq owned by creators.id; alter table creators alter column id set default nextval('creators_id_seq')`);
    await admin`insert into creator_types select * from public.creator_types`;
    await admin`insert into creator_roles select * from public.creator_roles`;
    await admin`insert into media_items(id,code,title,description,media_type,publication_status) values(1,'ani-import','First anime','Original description','anime','published'),(2,'jikan-import','Jikan anime','Jikan description','anime','published'),(3,'ani-legacy','Legacy anime',null,'anime','published')`;
    const evidence = async (mediaId:number,idMal:number|null) => {
      const descriptor=describeAniListCreators(String(mediaId));
      const payload={mediaId,idMal,complete:true,staff:[{id:mediaId*100,name:`Director ${mediaId}`,role:'Director'}],studios:[{id:mediaId*100,name:`Studio ${mediaId}`,isAnimationStudio:true}]};
      const [row]=await admin`insert into provider_snapshots(provider_code,resource_type,external_id,api_method,request_params,request_key,payload,payload_hash,content_type,request_started_at,fetched_at) values('anilist','anime',${String(mediaId)},'anime.creators',${admin.json(descriptor.requestParams)},${snapshotHash(descriptor.requestParams)},${admin.json(payload)},${snapshotHash(payload)},'application/json',now(),now()) returning id`;
      return {id:Number(row.id),payloadHash:snapshotHash(payload)};
    };
    const rawFacts=async(id:number)=>(await admin`select facts from media_item_metadata where media_item_id=${id}`)[0].facts;
    await t.test('first AniList import attaches the dependency before syncing and creates requests',async()=>{
      const ref=await evidence(1,null);
      const result=await upsertMediaItemMetadata({mediaItemId:1,sourceProvider:'anilist',sourceExternalId:'1',facts:{studios:['Legacy Studio'],kept:'anime'},snapshotReferences:[ref]});
      assert.equal(result.sourceProvider,'anilist');
      const {getAnimeCreatorDisplay}=await import("../src/db/queries/anilist-creator-display");
      const display=await getAnimeCreatorDisplay(1);
      assert.deepEqual(display?.directors.map(row=>row.name),['Director 1']);
      assert.deepEqual(display?.productionCompanies.map(row=>row.name),['Studio 1']);
      assert.equal((await admin`select count(*)::int n from provider_snapshot_links where entity_type='media-item' and entity_id='1' and purpose='dependency' and snapshot_id=${ref.id}`)[0].n,1);
      assert.equal((await admin`select count(*)::int n from creator_request_media_items where media_item_id=1`)[0].n,2);
      assert.deepEqual(await rawFacts(1),{kept:'anime',anilistCreatorsComplete:true});
      assert.equal((await admin`select description from media_items where id=1`)[0].description,'Original description');
    });
    await t.test('Jikan upsert links exact MAL evidence and preserves primary provider and description',async()=>{
      const ref=await evidence(2,222);
      const result=await upsertMediaItemMetadata({mediaItemId:2,sourceProvider:'jikan',sourceExternalId:'222',facts:{jikanFact:true,studios:['Old']},snapshotReferences:[ref]});
      assert.equal(result.sourceProvider,'jikan'); assert.equal(result.sourceExternalId,'222');
      assert.deepEqual(await rawFacts(2),{jikanFact:true,anilistCreatorsComplete:true});
      assert.equal((await admin`select description from media_items where id=2`)[0].description,'Jikan description');
      assert.equal((await admin`select count(*)::int n from creator_request_media_items where media_item_id=2`)[0].n,2);
      await assert.rejects(upsertMediaItemMetadata({mediaItemId:2,sourceProvider:'jikan',sourceExternalId:'223',facts:{},snapshotReferences:[ref]}),/INVALID_PROVIDER_SNAPSHOT_REFERENCES/);
      assert.equal((await admin`select source_external_id from media_item_metadata where media_item_id=2`)[0].source_external_id,'222');
    });
    await t.test('same-source metadata edits preserve completion and projected studios without storing fallback',async()=>{
      const result=await upsertMediaItemMetadata({mediaItemId:1,sourceProvider:'anilist',sourceExternalId:'1',facts:{kept:'edited',studios:['Stale fallback']}});
      assert.deepEqual(await rawFacts(1),{kept:'edited',anilistCreatorsComplete:true});
      assert.equal((await admin`select count(*)::int n from creator_request_media_items where media_item_id=1`)[0].n,2);
      assert.deepEqual(result.facts.studios,['Studio 1']);
      await upsertMediaItemMetadata({mediaItemId:3,sourceProvider:'anilist',sourceExternalId:'3',facts:{studios:['Unprocessed fallback']}});
      assert.deepEqual((await rawFacts(3)).studios,['Unprocessed fallback']);
      assert.equal((await rawFacts(3)).anilistCreatorsComplete,undefined);
    });
    await t.test('changing the source clears composition and completion while keeping manual links',async()=>{
      const [person]=await admin`select id from creator_types where code='person'`;
      const [role]=await admin`select id from creator_roles where code='director'`;
      const [creator]=await admin`insert into creators(name,slug,type_id) values('Manual Director','manual-director',${person.id}) returning id`;
      await admin`insert into entry_creators(entry_id,creator_id,role_id,is_manual) values(1,${creator.id},${role.id},true)`;
      await upsertMediaItemMetadata({mediaItemId:1,sourceProvider:'jikan',sourceExternalId:'999',facts:{studios:['New fallback']}});
      assert.equal((await rawFacts(1)).anilistCreatorsComplete,undefined);
      assert.deepEqual((await rawFacts(1)).studios,['New fallback']);
      assert.equal((await admin`select count(*)::int n from creator_request_media_items where media_item_id=1`)[0].n,0);
      assert.equal((await admin`select count(*)::int n from entry_creator_sources where entry_id=1 and provider='anilist'`)[0].n,0);
      assert.equal((await admin`select count(*)::int n from entry_creators where entry_id=1 and creator_id=${creator.id} and is_manual`)[0].n,1);
    });

    await t.test('anime raw cache seeds director profiles without HTTP and old missing fields retain Staff fallback',async()=>{
      const {fetchAniListCreatorSnapshot}=await import('../src/lib/providers/anilist-creators-service');
      const {creatorProfileDescriptor}=await import('../src/lib/providers/creator-profile-targets');
      const {getProviderSnapshot}=await import('../src/db/queries/provider-snapshots');
      const {fetchCreatorProfileSnapshot}=await import('../src/lib/providers/creator-profile-service');
      const ref=await evidence(4000,null);
      const [saved]=await admin`select payload,request_started_at from provider_snapshots where id=${ref.id}`;
      const payload={...saved.payload,staff:[{id:400001,name:'Photo Director',role:'Director',image:{large:'https://s4.anilist.co/file/director.jpg',medium:null},siteUrl:'https://anilist.co/staff/400001'},
        {id:400002,name:'Missing Photo Director',role:'Director',image:null}, {id:400003,name:'Old Director',role:'Director'},
        {id:400004,name:'Episode Director',role:'Episode Director',image:{large:'https://s4.anilist.co/file/episode.jpg'}},
        {id:400006,name:'Bad Optional Photo',role:'Director',image:{large:'https://evil.test/invalid.jpg'}}]};
      await admin`update provider_snapshots set payload=${admin.json(payload)},payload_hash=${snapshotHash(payload)} where id=${ref.id}`;
      const originalFetch=global.fetch; let calls=0;
      global.fetch=async()=>{calls++;throw new Error('current anime raw must not fetch Staff');};
      const target=(id:number)=>({provider:'anilist',resourceType:'person',externalId:String(id)} as const);
      try {
        await fetchAniListCreatorSnapshot({provider:'anilist',externalId:'4000',mediaType:'anime'},{snapshotReuseAfter:new Date(0)});
        const photo=(await getProviderSnapshot(creatorProfileDescriptor(target(400001))))!;
        assert.deepEqual(photo.payload,{id:400001,name:{full:'Photo Director'},image:payload.staff[0].image,siteUrl:'https://anilist.co/staff/400001'});
        assert.equal(photo.requestStartedAt.getTime(),new Date(saved.request_started_at).getTime());
        assert.equal((await fetchCreatorProfileSnapshot(target(400001),{signal:new AbortController().signal,onlyMissing:true})).id,photo.id);
        const missing=await fetchCreatorProfileSnapshot(target(400002),{signal:new AbortController().signal,onlyMissing:true});
        assert.equal((missing.payload as {image:null}).image,null);
        assert.equal(await getProviderSnapshot(creatorProfileDescriptor(target(400003))),null,'old snapshots must not synthesize an authoritative empty image');
        assert.equal(await getProviderSnapshot(creatorProfileDescriptor(target(400004))),null,'only exact Director roles seed portraits');
        assert.equal(calls,0);
        assert.equal(await getProviderSnapshot(creatorProfileDescriptor(target(400006))),null,'bad optional images must not fail valid anime raw reuse');
        const {attachCreatorProfileSnapshot}=await import('../src/db/queries/creator-profile-snapshots');
        const {commitCreatorImage,creatorImageBindingsQuery}=await import('../src/db/queries/creator-image-commit');
        const [type]=await admin`select id from creator_types where code='person'`;
        const [creator]=await admin`insert into creators(name,slug,type_id) values('Portrait Owner','portrait-owner',${type.id}) returning id`;
        const [binding]=await admin`insert into provider_creator_bindings(provider,external_creator_id,creator_id) values('anilist','person:400001',${creator.id}) returning id`;
        await attachCreatorProfileSnapshot({creatorId:creator.id,bindingId:binding.id,ref:{id:photo.id,payloadHash:photo.payloadHash}});
        const bindings=await creatorImageBindingsQuery(creator.id);
        const commit={creatorId:creator.id,expectedVersion:0,typeCode:'person',binding:bindings[0],bindings,target:target(400001),snapshot:{id:photo.id,payloadHash:photo.payloadHash},objectKey:`avatars/creators/${creator.id}/00000000-0000-0000-0000-000000000001.webp`,contentHash:'a'.repeat(64),originalUrl:'https://s4.anilist.co/file/director.jpg',sourceUrl:'https://anilist.co/staff/400001'};
        assert.equal(await commitCreatorImage(commit),true,'AniList source satisfies the production avatar constraint');
        assert.equal((await admin`select avatar_source from creators where id=${creator.id}`)[0].avatar_source,'anilist');
        await assert.rejects(admin`update creators set avatar_source_external_id='studio:400001' where id=${creator.id}`,/creators_avatar_check/);
        await admin`update creators set avatar_source='manual',avatar_source_external_id=null,avatar_source_url=null,avatar_original_url=null,avatar_fetched_at=null,avatar_version=2 where id=${creator.id}`;
        assert.equal(await commitCreatorImage({...commit,expectedVersion:1}),false,'concurrent manual ownership cannot be replaced');
        await admin`update creators set avatar_object_key=null,avatar_source=null,avatar_content_hash=null,avatar_version=3 where id=${creator.id}`;
        await admin`insert into provider_creator_bindings(provider,external_creator_id,creator_id) values('anilist','person:400005',${creator.id})`;
        assert.equal(await commitCreatorImage({...commit,expectedVersion:3}),false,'changed bindings invalidate an acquired portrait');
        const [lease]=await admin`insert into job_runs(type,status,source,payload,lock_token,lock_expires_at,scheduled_for,available_at,max_attempts,timeout_seconds,retry_base_seconds,retry_max_seconds) values('media.creator-image-fill','running','event','{}','portrait-expired',now()-interval '1 second',now(),now(),3,300,60,3600) returning id`;
        await assert.rejects(commitCreatorImage({...commit,expectedVersion:3,guard:{runId:lease.id,lockToken:'portrait-expired'}}),/STALE_SNAPSHOT_JOB/);
        await assert.rejects(fetchAniListCreatorSnapshot({provider:'anilist',externalId:'4000',mediaType:'anime'},{snapshotReuseAfter:new Date(0),snapshotJobGuard:{runId:lease.id,lockToken:'portrait-expired'}}),/STALE_SNAPSHOT_JOB/,'best-effort optional seeding must never swallow a lost lease');
        global.fetch=async(_url,init)=>{calls++;assert.match(String(init?.body),/StaffImage/);return Response.json({data:{Staff:{id:400003,name:{full:'Old Director'},image:null,siteUrl:null}}});};
        const fallback=await fetchCreatorProfileSnapshot(target(400003),{signal:new AbortController().signal,onlyMissing:true});
        assert.equal((fallback.payload as {id:number}).id,400003);assert.equal(calls,1);
      } finally {global.fetch=originalFetch;}
    });
    await t.test('shared snapshot workflow selects raw evidence, reuses Jikan and detects roster differences',async()=>{
      const {providerSnapshotAnimeBatchQuery}=await import('../src/db/queries/provider-snapshot-jobs');
      const {getSavedAniListCreatorSnapshot,fetchAniListCreatorSnapshot,getAniListCreatorMigrationComparison,isAniListCreatorSnapshotSupported}=await import('../src/lib/providers/anilist-creators-service');
      await admin`insert into media_items(id,code,title,media_type,publication_status) select n,'snapshot-'||n,'Snapshot '||n,'anime','published' from generate_series(20,22)n`;
      await admin`insert into media_item_metadata(media_item_id,source_provider,source_external_id,facts) values(20,'anilist','2000','{}'),(21,'jikan','2100','{}'),(22,'jikan','2200','{}')`;
      const primary=await evidence(2000,null), supplemental=await evidence(2101,2100);
      assert.equal((await getSavedAniListCreatorSnapshot('anilist','2000'))?.id,primary.id);
      assert.equal((await getSavedAniListCreatorSnapshot('jikan','2100'))?.id,supplemental.id);
      assert.equal(await getSavedAniListCreatorSnapshot('jikan','2200'),null);
      assert.equal(await isAniListCreatorSnapshotSupported(21),true);
      assert.equal(await isAniListCreatorSnapshotSupported(99999),false);
      assert.deepEqual((await providerSnapshotAnimeBatchQuery({afterId:19,throughId:22,onlyMissingSnapshots:true})).map(row=>row.id),[22],'saved raw evidence counts without attached links');
      assert.deepEqual((await providerSnapshotAnimeBatchQuery({afterId:19,throughId:22,onlyMissingSnapshots:true,retryId:21})).map(row=>row.id),[21,22]);
      assert.deepEqual((await providerSnapshotAnimeBatchQuery({afterId:19,throughId:22,mediaItemIds:[20,22],batchSize:1})).map(row=>row.id),[20,22],'one extra row indicates continuation');
      const originalFetch=global.fetch;
      global.fetch=async()=>{throw new Error('reused raw evidence must not fetch');};
      try {
        assert.deepEqual(await fetchAniListCreatorSnapshot({provider:'jikan',externalId:'2100',mediaType:'anime'},{snapshotReuseAfter:new Date(0)}),[supplemental]);
      } finally {global.fetch=originalFetch;}
      const snapshot=(await getSavedAniListCreatorSnapshot('anilist','2000'))!;
      assert.deepEqual((await getAniListCreatorMigrationComparison(20,snapshot)).blockers,['creator-roster-difference']);
      await upsertMediaItemMetadata({mediaItemId:20,sourceProvider:'anilist',sourceExternalId:'2000',facts:{},snapshotReferences:[primary]});
      assert.deepEqual((await getAniListCreatorMigrationComparison(20,snapshot)).blockers,[]);
      await admin`insert into entry_creators(entry_id,creator_id,role_id,is_manual) select 20,c.id,r.id,true from creators c cross join creator_roles r where c.slug='manual-director' and r.code='director'`;
      const withManual=await getAniListCreatorMigrationComparison(20,snapshot);
      assert.deepEqual(withManual.blockers,[],'manual participation is not a provider roster mismatch');
      assert.ok((withManual.current.directors as {name:string}[]).some(row=>row.name==='Manual Director'));
      await admin`update creator_requests set decision='exclude' where provider='anilist' and external_creator_id='person:200000'`;
      assert.deepEqual((await getAniListCreatorMigrationComparison(20,snapshot)).blockers,[],'moderated display loss is not a roster migration loss');
      await admin`update creator_request_media_items set source_position=9 where media_item_id=20`;
      assert.deepEqual((await getAniListCreatorMigrationComparison(20,snapshot)).blockers,['creator-roster-difference']);
      await evidence(2102,2100);
      await assert.rejects(getSavedAniListCreatorSnapshot('jikan','2100'),/AMBIGUOUS_ANILIST_SNAPSHOTS/);
      await admin`update provider_snapshots set payload_hash=repeat('a',64) where id=${primary.id}`;
      await assert.rejects(getSavedAniListCreatorSnapshot('anilist','2000'),/PROVIDER_SNAPSHOT_CHANGED/);
    });
    await t.test('real backfill continues, checkpoints retries, handles empty and unavailable rosters and fences stale work', {skip:!process.env.ANILIST_BACKFILL_TEST_REDIS_URL}, async()=>{
      process.env.REDIS_URL=process.env.ANILIST_BACKFILL_TEST_REDIS_URL;
      await admin`insert into provider_settings(media_type,provider_code,enabled) values('anime','anilist',true)`;
      await admin`insert into provider_rate_limits(provider_code,searches_per_day) values('anilist',100000)`;
      await admin`update media_item_metadata set facts=facts || '{"anilistCreatorsComplete":true}'::jsonb`;
      await admin`insert into media_items(id,code,title,media_type,publication_status) select n,'backfill-'||n,'Backfill '||n,'anime','published' from generate_series(10,15)n`;
      await admin`insert into media_item_metadata(media_item_id,source_provider,source_external_id,facts) select n,case when n=13 then 'jikan' else 'anilist' end,n::text,'{}'::jsonb from generate_series(10,15)n`;
      const {backfillAniListCreators}=await import('../src/lib/media/anilist-creators-backfill');
      const {getAnimeMissingCreatorRosterQuery}=await import('../src/db/queries/anilist-creators-backfill');
      const {closeRedisClient}=await import('../src/lib/services/redis');
      const [lease]=await admin`insert into job_runs(type,status,source,payload,lock_token,lock_expires_at,scheduled_for,available_at,max_attempts,timeout_seconds,retry_base_seconds,retry_max_seconds) values('media.metadata-backfill','running','event','{"creatorsOnly":true,"afterId":0}','anilist-backfill-test',now()+interval '10 minutes',now(),now(),3,300,60,3600) returning id`;
      const runId=Number(lease.id), lockToken='anilist-backfill-test';
      const calls:number[]=[];
      let fail12=true;
      const originalFetch=global.fetch;
      global.fetch=async(_url,init)=>{
        const body=JSON.parse(String(init?.body)); const id=Number(body.variables.id); calls.push(id);
        if(id===12 && fail12) return new Response('{}',{status:500});
        if(id===13) return Response.json({data:{Media:null}});
        if(id===14) await admin`update media_item_metadata set source_provider='jikan',source_external_id='1414' where media_item_id=14`;
        if(id===15) await admin`update job_runs set lock_expires_at=now()-interval '1 second' where id=${runId}`;
        return Response.json({data:{Media:{id,idMal:null,staff:{pageInfo:{currentPage:1,hasNextPage:false},edges:[]},studios:{pageInfo:{hasNextPage:false},nodes:[]}}}});
      };
      try {
        const first=await backfillAniListCreators({creatorsOnly:true,limit:1,quotaReserve:0,runId,lockToken});
        assert.equal(first.updated,1); assert.equal((await rawFacts(10)).anilistCreatorsComplete,true);
        assert.equal((await admin`select payload from job_runs where id=${runId}`)[0].payload.afterId,10);
        assert.equal((await admin`select count(*)::int n from job_runs where type='media.metadata-backfill' and status='queued' and payload @> '{"creatorsOnly":true,"afterId":10}'::jsonb`)[0].n,1);
        assert.equal((await getAnimeMissingCreatorRosterQuery(25,0)).some(row=>row.id===10),false,'a complete empty roster is terminal for missing-only');
        const failure=await backfillAniListCreators({creatorsOnly:true,limit:2,afterId:10,quotaReserve:0,runId,lockToken});
        assert.equal(failure.updated,1); assert.equal(failure.retryableFailed,1);
        assert.equal((await admin`select payload from job_runs where id=${runId}`)[0].payload.afterId,11,'failed item remains beyond the durable cursor');
        assert.equal((await rawFacts(12)).anilistCreatorsComplete,undefined);
        fail12=false;
        const retry=await backfillAniListCreators({creatorsOnly:true,limit:1,afterId:11,quotaReserve:0,runId,lockToken});
        assert.equal(retry.updated,1); assert.equal(calls.filter(id=>id===12).length,2);
        const unavailable=await backfillAniListCreators({creatorsOnly:true,mediaItemId:13,quotaReserve:0,runId,lockToken});
        assert.equal(unavailable.skipped,1); assert.equal((await rawFacts(13)).anilistCreatorsUnavailable,true);
        assert.equal((await getAnimeMissingCreatorRosterQuery(25,0)).some(row=>row.id===13),false);
        const stale=await backfillAniListCreators({creatorsOnly:true,mediaItemId:14,quotaReserve:0,runId,lockToken});
        assert.equal(stale.skipped,1); assert.equal((await rawFacts(14)).anilistCreatorsComplete,undefined);
        assert.equal((await admin`select count(*)::int n from provider_snapshot_links where entity_type='media-item' and entity_id='14'`)[0].n,0);
        const expired=await backfillAniListCreators({creatorsOnly:true,mediaItemId:15,quotaReserve:0,runId,lockToken});
        assert.equal(expired.retryableFailed,1); assert.equal((await rawFacts(15)).anilistCreatorsComplete,undefined);
        assert.equal((await admin`select count(*)::int n from provider_snapshots where provider_code='anilist' and external_id='15'`)[0].n,0,'expired guard fences even raw snapshot persistence');
      } finally {
        global.fetch=originalFetch;
        await closeRedisClient();
      }
    });
  } finally {
    await admin.unsafe(`drop schema if exists ${schema} cascade`);
    await Promise.all([dbClient.end(),admin.end()]);
  }
});
