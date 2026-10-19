import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { test } from "node:test";
const testUrl=process.env.PLATFORM_LOGOS_TEST_DATABASE_URL;
test("platform logo jobs resume catalogue and image checkpoints under their worker lease",{skip:!testUrl},async(t)=>{
 const schema=`platform_logo_jobs_${Date.now()}`;
 const url=new URL(testUrl!);url.searchParams.set("options",`-c search_path=${schema}`);
 process.env.DATABASE_URL=url.toString();process.env.DATABASE_MAX_CONNECTIONS="3";
 const {getDbClient}=await import("../src/db");const client=getDbClient();
 const requests=await import("../src/db/queries/platform-logo-requests");
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
      await client.begin(async tx => {
        for (const statement of readFileSync(`drizzle/${file}`, "utf8").replaceAll('"public".', `"${schema}".`).split("--> statement-breakpoint")) await tx.unsafe(statement);
      });
    }
    await client.unsafe(`CREATE TABLE provider_credentials(provider_code text,encrypted_payload text)`);
    const queries=await import('../src/db/queries/platform-logo-jobs');
    const {platformProviderApi}=await import('../src/lib/platforms/provider-api');
    const {platformLogosSyncHandler}=await import('../src/lib/platforms/logo-sync-job');
    const images=await import('../src/lib/platforms/provider-images');
    const {GameProviderDeferredError}=await import('../src/lib/covers/game-provider-budget');
    const {parsePlatformLogoSyncPayload}=await import('../src/lib/platforms/logo-sync-model');
    const previousCatalogue=platformProviderApi.fetchCataloguePage;
    const previousProfiles=platformProviderApi.fetchProfiles;
    const previousStore=images.saveProviderPlatformImage;
    const [target]=await client`insert into platforms(slug,name) values('job-target','Job Target') returning id`;
    await client`insert into provider_platform_mappings(provider,media_type,external_platform_name,normalized_external_platform_name,platform_id) values('igdb','game','Test Platform','test platform',${target.id})`;
    const start=async(payload:Record<string,unknown>={})=>{
      const [run]=await client`insert into job_runs(type,payload,source,status,created_by_admin_id,lock_token,lock_expires_at)
        values('media.platform-logos-sync',${JSON.stringify(payload)}::text::jsonb,'manual','running',1,'lease',now()+interval '1 hour') returning id`;
      return run.id as number;
    };
    const saved=async(id:number)=>(await client`select payload from job_runs where id=${id}`)[0].payload;
    const finish=async(id:number)=>client`update job_runs set status='succeeded' where id=${id}`;
    const tick=async(runId:number)=>{
      try {
        await platformLogosSyncHandler.execute({source:'manual',jobId:null,runId,lockToken:'lease',attempt:1,payload:parsePlatformLogoSyncPayload(await saved(runId)),signal:new AbortController().signal});
        return null;
      } catch(error) {
        if(error&&typeof error==='object'&&'deferSeconds' in error&&typeof error.deferSeconds==='number')return error.deferSeconds;
        throw error;
      }
    };
    const profile=(id:string,name:string,imageId:string|null=null)=>({provider:'igdb' as const,externalId:id,name,normalizedName:name.toLowerCase(),sourceUrl:null,imageId,imageUrl:imageId?`https://images.igdb.com/igdb/image/upload/t_original/${imageId}.png`:null});
    try {
      let catalogueCalls=0,quotaOnce=true,profileCalls=0;
      platformProviderApi.fetchCataloguePage=async(provider,cursor)=>{
        assert.equal(provider,'igdb');catalogueCalls++;
        if(!cursor)return {profiles:[profile('901','Test Platform'),profile('999','Unrelated Provider Platform')],nextCursor:901};
        if(quotaOnce){quotaOnce=false;throw new GameProviderDeferredError('provider-daily-limit',7200);}
        return {profiles:[],nextCursor:null};
      };
      platformProviderApi.fetchProfiles=async(provider,ids)=>{assert.equal(provider,'igdb');profileCalls++;return ids.map(id=>profile(id,'Test Platform'));};
      const runId=await start({platformId:target.id});
      await t.test('quota resumes the exact catalogue page and persists only platforms needed by existing mappings',async()=>{
        assert.equal(await tick(runId),1);
        assert.equal(catalogueCalls,1);
        assert.equal((await client`select count(*)::int n from platform_provider_profiles`)[0].n,1);
        assert.equal(await tick(runId),7200);
        assert.equal((await saved(runId)).checkpoint.directory.igdb.cursor,901);
        assert.equal(await tick(runId),1);
        assert.equal(catalogueCalls,3);
        assert.equal(await tick(runId),null);
        assert.equal((await saved(runId)).checkpoint.stage,'complete');
        assert.equal((await client`select external_platform_id from provider_platform_mappings where platform_id=${target.id}`)[0].external_platform_id,'901');
        assert.equal((await client`select count(*)::int n from platform_requests where target_platform_id=${target.id}`)[0].n,0);
        assert.equal(profileCalls,0,'catalogue already supplied this exact profile');
        await finish(runId);
      });
      await t.test('known provider IDs use details, fresh cached profiles do not repeat API requests',async()=>{
        const next=await start({platformId:target.id});
        assert.equal(await tick(next),null);await finish(next);
        assert.equal(catalogueCalls,3);assert.equal(profileCalls,0);
        const forced=await start({platformId:target.id,force:true});
        assert.equal(await tick(forced),1);assert.equal(profileCalls,1);
        assert.equal(await tick(forced),null);await finish(forced);
        assert.equal(catalogueCalls,3,'known IDs never scan the provider catalogue');
      });
      await t.test('a failed platform does not delay the next platform image choice or automatic apply',async()=>{
        const [bad]=await client`insert into platforms(slug,name) values('bad-image','Bad Image') returning id`;
        const [good]=await client`insert into platforms(slug,name) values('ready-image','Ready Image') returning id`;
        for(const [id,name,platformId,ready] of [['902','Bad Image',bad.id,false],['903','Ready Image',good.id,true]] as const) {
          await client`insert into platform_provider_profiles(provider,external_id,name,normalized_name,image_id,image_url,image_key,image_object_key,image_content_hash,profile_fetched_at)
            values('igdb',${id},${name},${name.toLowerCase()},${'logo-'+id},${'https://images.igdb.com/igdb/image/upload/t_original/logo-'+id+'.png'},
              ${ready?'logo-'+id:null},${ready?'avatars/platform-providers/igdb/'+id+'/'+'a'.repeat(64)+'.webp':null},${ready?'a'.repeat(64):null},now())`;
          await client`insert into provider_platform_mappings(provider,media_type,external_platform_name,normalized_external_platform_name,platform_id,external_platform_id)
            values('igdb','game',${name},${name.toLowerCase()},${platformId},${id})`;
        }
        const now=new Date().toISOString();
        const scope=[bad.id,good.id] as number[];
        const cp={version:2,scopeIds:scope,queue:scope,position:0,stage:'identity',directory:{
          igdb:{names:[],knownIds:['902','903'],cursor:0,complete:true,startedAt:now},
          rawg:{names:[],knownIds:[],cursor:0,complete:true,startedAt:now}},
          afterImageKey:'',retryIds:[],retryAt:{},attempts:{},doneIds:[],failedIds:[],startedAt:now,initialMappedIds:2};
        images.saveProviderPlatformImage=async(input)=>{if(input.profile.externalId==='902')throw new Error('image unavailable');return 'cached';};
        const next=await start({checkpoint:cp});
        assert.equal(await tick(next),2);
        const state=await saved(next);
        assert.deepEqual(state.checkpoint.retryIds,[bad.id]);
        const [choice]=await client`select * from platform_requests where target_platform_id=${good.id} and kind='logo'`;
        assert.equal(choice.apply_status,'applying');
        await requests.applyPlatformAssetRequest(choice.id,{jobRunId:choice.job_run_id});await finish(choice.job_run_id);
        assert.equal(await tick(next)!>0,true);
        assert.ok((await saved(next)).checkpoint.doneIds.includes(good.id));
        assert.equal((await client`select imported_logo_object_key from platforms where id=${good.id}`)[0].imported_logo_object_key!==null,true);
        assert.equal(profileCalls,1,'image retries never refetch successful game platform profiles');
        await finish(next);images.saveProviderPlatformImage=previousStore;
      });
      await t.test('lost lease cannot persist cache, binding progress or checkpoint',async()=>{
        const next=await start({platformId:target.id});
        await tick(next);const payload=await saved(next);
        await client`update job_runs set lock_token='new-owner' where id=${next}`;
        await assert.rejects(queries.savePlatformProfiles({runId:next,lockToken:'lease'},payload,'igdb',['998'],[profile('998','Stale')]),{code:'lease-lost'});
        assert.equal((await client`select count(*)::int n from platform_provider_profiles where external_id='998'`)[0].n,0);
        await finish(next);
      });
      await t.test('successful immutable images reuse one file across IDs without CDN or upload',async()=>{
        const next=await start({platformId:target.id});
        const payload={platformId:target.id};
        await client`update platform_provider_profiles set image_id='shared-logo',image_url='https://images.igdb.com/igdb/image/upload/t_original/shared-logo.png',
          image_key='shared-logo',image_object_key=${'avatars/platform-providers/igdb/901/'+'b'.repeat(64)+'.webp'},image_content_hash=${'b'.repeat(64)} where external_id='901'`;
        await client`update platform_provider_profiles set image_id='shared-logo',image_url='https://images.igdb.com/igdb/image/upload/t_original/shared-logo.png',image_key=null,image_object_key=null,image_content_hash=null where external_id='902'`;
        const store=images.createPlatformProviderImageStore({fetchImage:async()=>assert.fail('must reuse local asset'),transform:async()=>assert.fail('must reuse processed bytes'),upload:async()=>assert.fail('must reuse object')});
        const [cached]=await client`select provider,external_id as "externalId",image_id as "imageId",image_url as "imageUrl",image_key as "imageKey",image_object_key as "imageObjectKey",image_content_hash as "imageContentHash" from platform_provider_profiles where external_id='902'`;
        assert.equal(await store({lease:{runId:next,lockToken:'lease'},payload,profile:cached as never}),'cached');
        assert.equal((await client`select image_object_key from platform_provider_profiles where external_id='902'`)[0].image_object_key,(await client`select image_object_key from platform_provider_profiles where external_id='901'`)[0].image_object_key);
        await finish(next);
      });
      await t.test('active jobs remain visible before newer completed children at representative scale',{skip:!process.env.PLATFORM_LOGOS_PERF},async()=>{
        await client.unsafe(`insert into job_runs(type,source,status,created_at,payload)
          select 'test.finished','manual','succeeded',now(),'{}'::jsonb from generate_series(1,100000);
          insert into job_runs(type,source,status,created_at) values('test.pending','manual','queued','2000-01-01');analyze job_runs;`);
        const {getAdminJobRuns}=await import('../src/db/queries/jobs');
        const page=await getAdminJobRuns({page:1,pageSize:25});
        assert.equal(page.items[0].type,'test.pending');
        const [plan]=await client.unsafe(`explain(analyze,buffers,format json) select id from job_runs
          order by case when status in ('queued','running') then 0 else 1 end,created_at desc,id desc limit 25`);
        const json=JSON.stringify(plan);
        assert.ok(json.includes('job_runs_journal_active_idx'));
        t.diagnostic('100k jobs active-first '+JSON.stringify(plan['QUERY PLAN'][0]));
      });
    } finally {platformProviderApi.fetchCataloguePage=previousCatalogue;platformProviderApi.fetchProfiles=previousProfiles;images.saveProviderPlatformImage=previousStore;}
 } finally {
   await client.unsafe(`DROP SCHEMA IF EXISTS ${schema} CASCADE`);
   await client.end();
 }
});
