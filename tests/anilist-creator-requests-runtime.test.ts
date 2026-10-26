import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { test } from "node:test";
import { sql } from "drizzle-orm";

const testUrl = process.env.ANILIST_CREATORS_TEST_DATABASE_URL;

test("AniList creators approve, replay and moderate through existing Creator machinery", { skip: !testUrl }, async (t) => {
  const schema = `anilist_requests_${Date.now()}`;
  const url = new URL(testUrl!);
  url.searchParams.set("options", `-c search_path=${schema}`);
  process.env.DATABASE_URL = url.toString();
  process.env.DATABASE_MAX_CONNECTIONS = "3";
  const { getDbClient, db } = await import("../src/db");
  const { mediaItems } = await import("../src/db/schema");
  const creators = await import("../src/db/queries/creators");
  const requests = await import("../src/db/queries/creator-requests");
  const client = getDbClient();
  try {
    await client.unsafe(`CREATE SCHEMA ${schema}`);
    await client.unsafe(`CREATE TABLE media_types(code text PRIMARY KEY,name text,is_publicly_available boolean DEFAULT true); INSERT INTO media_types(code,name) VALUES('book','Книга'),('film','Фильм'),('boardgame','Настолка'),('game','Игра'),('anime','Аниме');
      CREATE TABLE admin_users(id integer PRIMARY KEY); INSERT INTO admin_users VALUES(1);
      CREATE TABLE media_items(id integer PRIMARY KEY,code text,title text,media_type text,publication_status text);
      INSERT INTO media_items VALUES(1,'one','Один','game','published'),(2,'two','Два','game','published'),(3,'three','Три','game','published'),(4,'four','Четыре','game','draft'),(5,'five','Пять','game','published');
      ALTER TABLE media_items ADD COLUMN original_title text,ADD COLUMN description text,ADD COLUMN media_carrier_id integer,ADD COLUMN release_year integer,
        ADD COLUMN cover_url text,ADD COLUMN cover_thumb_url text,ADD COLUMN cover_thumb_attempted_at timestamptz,ADD COLUMN metadata_attempted_at timestamptz,
        ADD COLUMN shikimori_enrichment_attempted_at timestamptz,ADD COLUMN metadata_issue_code text,ADD COLUMN cover_source_provider text,
        ADD COLUMN cover_source_external_id text,ADD COLUMN cover_source_page_url text,ADD COLUMN author_creation_request_id integer,
        ADD COLUMN created_by_author_id integer,ADD COLUMN moderation_revision integer,ADD COLUMN created_at timestamptz DEFAULT now(),
        ADD COLUMN updated_at timestamptz DEFAULT now(),ADD COLUMN submitted_at timestamptz,ADD COLUMN reviewed_by_admin_id integer,
        ADD COLUMN reviewed_at timestamptz,ADD COLUMN admin_note text;
      CREATE TABLE franchises(id integer PRIMARY KEY,code text,title text,publication_status text);
      INSERT INTO franchises VALUES(1,'related','Связанная серия','published'),(2,'private','Скрытая серия','draft');
      CREATE TABLE media_item_metadata(media_item_id integer PRIMARY KEY REFERENCES media_items(id),facts jsonb NOT NULL DEFAULT '{}',source_provider text,
        source_external_id text,source_url text,fetched_at timestamptz,created_at timestamptz DEFAULT now(),updated_at timestamptz DEFAULT now());
      CREATE TABLE admin_activity_logs(id serial PRIMARY KEY,created_at timestamptz DEFAULT now(),actor_type text,admin_user_id integer,
        author_id integer,action text,entity_type text,entity_id integer,entity_label text,status text,severity text,message text,ip_address text,user_agent text,metadata jsonb);
      CREATE TABLE job_runs(id serial PRIMARY KEY,job_id integer,retry_of_run_id integer,created_by_admin_id integer,type text,payload jsonb DEFAULT '{}',
        source text,status text DEFAULT 'queued',scheduled_for timestamptz,available_at timestamptz,attempts integer DEFAULT 0,max_attempts integer,
        timeout_seconds integer,retry_base_seconds integer,retry_max_seconds integer,locked_at timestamptz,locked_by text,lock_token text,
        lock_expires_at timestamptz,started_at timestamptz,finished_at timestamptz,cancelled_at timestamptz,error_code text,error_message text,
        created_at timestamptz DEFAULT now(),updated_at timestamptz DEFAULT now());`);
    await client.unsafe(`CREATE TABLE media_item_provider_snapshots(media_item_id integer PRIMARY KEY,provider_code text,external_id text,media_type text,title text,original_title text,description text,release_year integer,source_url text,facts jsonb DEFAULT '{}',payload_hash text,fetched_at timestamptz DEFAULT now(),created_at timestamptz DEFAULT now(),updated_at timestamptz DEFAULT now());`);
    for (const migration of ["drizzle/0117_creators.sql", "drizzle/0118_creator_original_name.sql", "drizzle/0119_creator_relations.sql", "drizzle/0123_creator_avatars.sql", "drizzle/0124_bgg_creators.sql", "drizzle/0125_game_company_creators.sql", "drizzle/0127_provider_snapshots.sql", "drizzle/0131_creator_life_dates.sql", "drizzle/0135_tmdb_company_creators.sql", "drizzle/0136_tmdb_director_creators.sql", "drizzle/0143_tmdb_series_creators.sql", "drizzle/0144_anilist_creators.sql"]) {
      for (const statement of readFileSync(migration, "utf8").split("--> statement-breakpoint")) await client.unsafe(statement);
    }
    await client.unsafe(`ALTER TABLE creators ADD COLUMN name_ru text,ADD COLUMN name_ru_source text,ADD COLUMN name_ru_processed boolean NOT NULL DEFAULT false`);
    await client.unsafe(`CREATE TABLE domain_events(id uuid PRIMARY KEY DEFAULT gen_random_uuid(),type text NOT NULL,schema_version integer NOT NULL DEFAULT 1,
      actor_author_id integer,aggregate_type text NOT NULL,aggregate_id text NOT NULL,payload jsonb NOT NULL DEFAULT '{}',occurred_at timestamptz NOT NULL DEFAULT now());
      CREATE TABLE domain_event_outbox(event_id uuid PRIMARY KEY REFERENCES domain_events(id),dispatched_at timestamptz,next_attempt_at timestamptz default now(),created_at timestamptz DEFAULT now(),updated_at timestamptz DEFAULT now());`);
    const { syncAniListCreators } = await import('../src/db/queries/anilist-creators');
    const { snapshotHash } = await import('../src/lib/providers/snapshot-values');
    const { prepareAniListCreatorSnapshot } = await import('../src/lib/providers/anilist-creators-service');
    await client`update media_items set media_type='anime'`;
    const person = (await creators.getCreatorTypes()).find(row => row.code === 'person')!;
    const organization = (await creators.getCreatorTypes()).find(row => row.code === 'organization')!;
    const attach = async (id: number, staff: unknown[], studios: unknown[] = [], options: { provider?: "anilist" | "jikan"; idMal?: number } = {}) => {
      const provider = options.provider ?? "anilist";
      const sourceId = provider === "jikan" ? String(options.idMal) : String(id);
      await client`insert into media_item_metadata(media_item_id,source_provider,source_external_id,facts) values(${id},${provider},${sourceId},'{"kept":true}') on conflict(media_item_id) do update set source_provider=excluded.source_provider,source_external_id=excluded.source_external_id`;
      const payload = { mediaId:id, idMal:options.idMal ?? null, staff, studios, complete:true };
      const [snapshot] = await client`insert into provider_snapshots(provider_code,resource_type,external_id,api_method,request_params,request_key,payload,content_type,payload_hash,request_started_at,fetched_at)
        values('anilist','anime',${String(id)},'anime.creators','{"version":1}',${snapshotHash({version:1})},${JSON.stringify(payload)}::jsonb,'application/json',${snapshotHash(payload)},now(),now())
        on conflict(provider_code,resource_type,external_id,api_method,request_key) do update set payload=excluded.payload,payload_hash=excluded.payload_hash returning id`;
      await client`insert into provider_snapshot_links(snapshot_id,entity_type,entity_id,purpose) values(${snapshot.id},'media-item',${String(id)},'dependency') on conflict do nothing`;
      return { id: Number(snapshot.id), payloadHash: snapshotHash(payload) };
    };
    const replay = (id: number) => db.transaction(async tx => {
      await tx.select({ id: mediaItems.id }).from(mediaItems).where(sql`${mediaItems.id}=${id}`).for('update');
      return syncAniListCreators(tx,id,{enqueueApproval:false});
    });
    const requestFor = async (externalId:string) => (await client`select * from creator_requests where provider='anilist' and external_creator_id=${externalId}`)[0];
    const bindingFor = async (externalId:string) => (await client`select * from provider_creator_bindings where provider='anilist' and external_creator_id=${externalId} and active`)[0];
    const apply = async (decision:{requestId:number;jobRunId:number}) => {
      await requests.applyCreatorRequest(decision.requestId,{jobRunId:decision.jobRunId});
      await client`update job_runs set status='succeeded' where id=${decision.jobRunId}`;
    };
    const approve = async (externalId:string) => {
      assert.equal((await requests.autoApproveAniListCreatorRequests({externalIds:[externalId]})).approved,1);
      const r=await requestFor(externalId);
      await apply({requestId:r.id,jobRunId:r.job_run_id});
      return bindingFor(externalId);
    };
    const director=(id:number,name:string)=>({id,name,role:'Director'});
    await t.test('auto-create preserves namespaces, complete roster and repeat import idempotence',async()=>{
      await attach(1,[director(100,'New Director'),director(101,'Second Director')],[{id:100,name:'New Studio',isAnimationStudio:true},{id:102,name:'New Producer',isAnimationStudio:false}]);
      await replay(1);
      const originalFetch=global.fetch;
      global.fetch=async()=>{throw new Error('network forbidden');};
      try {
        for(const externalId of ['person:100','person:101','studio:100','studio:102']) await approve(externalId);
        await replay(1); await replay(1);
        assert.equal((await client`select count(*)::int n from creators`)[0].n,4);
        assert.equal((await client`select count(*)::int n from entry_creator_sources where entry_id=1`)[0].n,4);
        assert.notEqual((await bindingFor('person:100')).creator_id,(await bindingFor('studio:100')).creator_id);
        assert.equal((await requests.autoApproveAniListCreatorRequests({externalIds:['person:100']})).approved,0);
      } finally {global.fetch=originalFetch;}
    });
    await t.test('mapping never crosses person and organization types',async()=>{
      await attach(2,[director(200,'Pending Director')],[{id:200,name:'Pending Studio',isAnimationStudio:true}]); await replay(2);
      const personCreator=await creators.createCreator({name:'Existing Person',slug:'existing-person',typeId:person.id});
      const orgCreator=await creators.createCreator({name:'Existing Organization',slug:'existing-org',typeId:organization.id});
      await assert.rejects(requests.resolveCreatorRequest({requestId:(await requestFor('person:200')).id,adminId:1,decision:'map',creatorId:orgCreator.id}));
      await assert.rejects(requests.resolveCreatorRequest({requestId:(await requestFor('studio:200')).id,adminId:1,decision:'map',creatorId:personCreator.id}));
    });
    await t.test('confirmed binding takes priority and ambiguous names remain pending',async()=>{
      const existing=await creators.createCreator({name:'Known Person',slug:'known-person',typeId:person.id});
      await attach(3,[director(300,'Known Person')]); await replay(3);
      assert.deepEqual(await requests.autoApproveAniListCreatorRequests({externalIds:['person:300']}),{approved:0,skipped:1});
      await client`insert into provider_creator_bindings(provider,external_creator_id,creator_id,external_creator_name) values('anilist','person:300',${existing.id},'Known Person')`;
      await approve('person:300');
      assert.equal((await bindingFor('person:300')).creator_id,existing.id);
      await attach(4,[],[{id:400,name:'Ambiguous Studio',isAnimationStudio:true}]); await replay(4);
      await creators.createCreator({name:'Ambiguous Studio',slug:'ambiguous-one',typeId:organization.id});
      await creators.createCreator({name:'Ambiguous Studio',slug:'ambiguous-two',typeId:organization.id});
      assert.deepEqual(await requests.autoApproveAniListCreatorRequests({externalIds:['studio:400']}),{approved:0,skipped:1});
    });
    await t.test('reopen and exclusion survive import, while manual participation survives an empty roster',async()=>{
      const binding=await bindingFor('person:300');
      await client`update entry_creators set is_manual=true where entry_id=3 and creator_id=${binding.creator_id}`;
      await apply(await requests.reopenCreatorBinding({bindingId:binding.id,adminId:1}));
      await replay(3);
      assert.equal((await requests.autoApproveAniListCreatorRequests({externalIds:['person:300']})).approved,0);
      await apply(await requests.resolveCreatorRequest({requestId:(await requestFor('person:300')).id,adminId:1,decision:'exclude'}));
      await replay(3);
      assert.equal(await bindingFor('person:300'),undefined);
      assert.equal((await client`select count(*)::int n from entry_creator_sources where entry_id=3`)[0].n,0);
      await attach(3,[]); await replay(3);
      assert.equal((await client`select count(*)::int n from entry_creators where entry_id=3 and creator_id=${binding.creator_id} and is_manual`)[0].n,1);
    });

    await t.test('Jikan exact MAL enrichment preserves primary metadata and rejects another MAL ID',async()=>{
      const reference=await attach(5,[director(500,'Jikan Director')],[{id:500,name:'Jikan Studio',isAnimationStudio:true}],{provider:'jikan',idMal:555});
      await client`update media_items set description='Primary Jikan description' where id=5`;
      await client`update media_item_metadata set facts='{"kept":true,"studios":["Legacy Studio"],"primaryFact":"jikan"}' where media_item_id=5`;
      await assert.rejects(prepareAniListCreatorSnapshot('jikan','556',[reference]),/INVALID_PROVIDER_SNAPSHOT_REFERENCES/);
      assert.equal((await prepareAniListCreatorSnapshot('jikan','555',[reference])).id,reference.id);
      await replay(5);
      await approve('person:500'); await approve('studio:500');
      const [state]=await client`select m.description,md.source_provider,md.source_external_id,md.facts from media_items m join media_item_metadata md on md.media_item_id=m.id where m.id=5`;
      assert.equal(state.description,'Primary Jikan description');
      assert.equal(state.source_provider,'jikan'); assert.equal(state.source_external_id,'555');
      assert.deepEqual(state.facts,{kept:true,primaryFact:'jikan',anilistCreatorsComplete:true});
      assert.equal((await client`select count(*)::int n from entry_creator_sources where entry_id=5 and provider='anilist'`)[0].n,2);
      await client`update media_item_metadata set source_external_id='556' where media_item_id=5`;
      await assert.rejects(replay(5),/PROVIDER_SNAPSHOT_MISSING/);
      assert.equal((await client`select count(*)::int n from entry_creator_sources where entry_id=5 and provider='anilist'`)[0].n,2);
      await client`update media_item_metadata set source_external_id='555' where media_item_id=5`;
    });
    await t.test('a changed snapshot hash rejects stale prepare and partial payload cannot clear a working roster',async()=>{
      const reference=await attach(5,[director(500,'Jikan Director')],[{id:500,name:'Jikan Studio',isAnimationStudio:true}],{provider:'jikan',idMal:555});
      const [saved]=await client`select payload,payload_hash from provider_snapshots where id=${reference.id}`;
      const partial={...saved.payload,complete:false,staff:[]};
      await client`update provider_snapshots set payload=${JSON.stringify(partial)}::jsonb,payload_hash=${snapshotHash(partial)} where id=${reference.id}`;
      await assert.rejects(prepareAniListCreatorSnapshot('jikan','555',[reference]),/PROVIDER_SNAPSHOT_CHANGED/);
      await assert.rejects(replay(5),/INVALID_ANILIST_ROSTER/);
      assert.equal((await client`select count(*)::int n from entry_creator_sources where entry_id=5 and provider='anilist'`)[0].n,2);
      await client`update provider_snapshots set payload=${JSON.stringify(saved.payload)}::jsonb,payload_hash=${saved.payload_hash} where id=${reference.id}`;
    });
    await t.test('switching primary provider clears stale AniList provenance and retains manual links',async()=>{
      const binding=await bindingFor('person:500');
      await client`update entry_creators set is_manual=true where entry_id=5 and creator_id=${binding.creator_id}`;
      await client`update media_item_metadata set source_provider='manual',source_external_id=null where media_item_id=5`;
      await replay(5);
      assert.equal((await client`select count(*)::int n from entry_creator_sources where entry_id=5 and provider='anilist'`)[0].n,0);
      assert.equal((await client`select count(*)::int n from entry_creators where entry_id=5 and creator_id=${binding.creator_id} and is_manual`)[0].n,1);
      assert.equal((await client`select count(*)::int n from entry_creators where entry_id=5 and creator_id<>${binding.creator_id}`)[0].n,0);
    });
  } finally {
    await client.unsafe(`drop schema if exists ${schema} cascade`);
    await client.end();
  }
});
