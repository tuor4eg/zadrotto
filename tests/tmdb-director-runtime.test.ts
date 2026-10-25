import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { test } from "node:test";
import { sql } from "drizzle-orm";

const testUrl = process.env.TMDB_DIRECTORS_TEST_DATABASE_URL;

test("TMDB directors replay and moderate through existing Creator machinery", { skip: !testUrl }, async (t) => {
  const schema = `tmdb_directors_${Date.now()}`;
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
    await client.unsafe(`CREATE TABLE media_types(code text PRIMARY KEY,name text,is_publicly_available boolean DEFAULT true); INSERT INTO media_types(code,name) VALUES('book','Книга'),('film','Фильм'),('boardgame','Настолка'),('game','Игра');
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
    for (const migration of ["drizzle/0117_creators.sql", "drizzle/0118_creator_original_name.sql", "drizzle/0119_creator_relations.sql", "drizzle/0123_creator_avatars.sql", "drizzle/0124_bgg_creators.sql", "drizzle/0125_game_company_creators.sql", "drizzle/0127_provider_snapshots.sql", "drizzle/0131_creator_life_dates.sql", "drizzle/0135_tmdb_company_creators.sql", "drizzle/0136_tmdb_director_creators.sql"]) {
      for (const statement of readFileSync(migration, "utf8").split("--> statement-breakpoint")) await client.unsafe(statement);
    }
    await client.unsafe(`ALTER TABLE creators ADD COLUMN name_ru text,ADD COLUMN name_ru_source text,ADD COLUMN name_ru_processed boolean NOT NULL DEFAULT false`);
    await client.unsafe(`CREATE TABLE domain_events(id uuid PRIMARY KEY DEFAULT gen_random_uuid(),type text NOT NULL,schema_version integer NOT NULL DEFAULT 1,
      actor_author_id integer,aggregate_type text NOT NULL,aggregate_id text NOT NULL,payload jsonb NOT NULL DEFAULT '{}',occurred_at timestamptz NOT NULL DEFAULT now());
      CREATE TABLE domain_event_outbox(event_id uuid PRIMARY KEY REFERENCES domain_events(id),dispatched_at timestamptz,next_attempt_at timestamptz default now(),created_at timestamptz DEFAULT now(),updated_at timestamptz DEFAULT now());`);
    const { syncTmdbFilmDirectors } = await import('../src/db/queries/tmdb-directors');
    const { getFilmDirectorDisplay } = await import('../src/db/queries/tmdb-director-display');
    const { snapshotHash } = await import('../src/lib/providers/snapshot-values');
    const { describeTmdbFilmSource } = await import('../src/lib/providers/tmdb-film-adapter');
    const mutations = new Map<string,{ query:string;params:unknown[] }>();
    client.options.debug = (_connection,query,params) => {
      if (/^(insert into|update|delete from) "(creators|creator_requests|creator_request_media_items|entry_creators|entry_creator_sources|provider_creator_bindings|provider_creator_exclusions|job_runs)"/.test(query)) mutations.set(query,{ query,params:[...params] });
    };
    await client`update media_items set media_type='film'`;
    const person = (await creators.getCreatorTypes()).find(row => row.code === 'person')!;
    const organization = (await creators.getCreatorTypes()).find(row => row.code === 'organization')!;
    const attach = async (id: number, crew: unknown) => {
      await client`insert into media_item_metadata(media_item_id,source_provider,source_external_id,facts) values(${id},'tmdb',${String(id)},'{"kept":true}') on conflict(media_item_id) do update set source_provider='tmdb',source_external_id=excluded.source_external_id`;
      const payload = { id, credits: { crew } };
      const [snapshot] = await client`insert into provider_snapshots(provider_code,resource_type,external_id,api_method,request_params,request_key,payload,content_type,payload_hash,request_started_at,fetched_at)
        values('tmdb','movie',${String(id)},'movie.details','{"language":"ru-RU","append_to_response":"credits"}',${snapshotHash(describeTmdbFilmSource(String(id)).requestParams)},${JSON.stringify(payload)}::jsonb,'application/json',${snapshotHash(payload)},now(),now())
        on conflict(provider_code,resource_type,external_id,api_method,request_key) do update set payload=excluded.payload,payload_hash=excluded.payload_hash returning id`;
      await client`insert into provider_snapshot_links(snapshot_id,entity_type,entity_id,purpose) values(${snapshot.id},'media-item',${String(id)},'primary') on conflict do nothing`;
    };
    const replay = (id: number) => db.transaction(async tx => {
      await tx.select({ id: mediaItems.id }).from(mediaItems).where(sql`${mediaItems.id}=${id}`).for('update');
      return syncTmdbFilmDirectors(tx, id, { enqueueApproval: false });
    });
    const requestFor = async (id: number) => (await client`select * from creator_requests where provider='tmdb' and external_creator_id=${`person:${id}`}`)[0];
    const bindingFor = async (id: number) => (await client`select * from provider_creator_bindings where provider='tmdb' and external_creator_id=${`person:${id}`} and active`)[0];
    const apply = async (decision: { requestId: number; jobRunId: number }) => {
      await requests.applyCreatorRequest(decision.requestId, { jobRunId: decision.jobRunId });
      await client`update job_runs set status='succeeded' where id=${decision.jobRunId}`;
    };
    const approve = async (id: number) => {
      assert.equal((await requests.autoApproveTmdbDirectorRequests({ externalIds: [`person:${id}`] })).approved, 1);
      const r = await requestFor(id);
      await apply({ requestId: r.id, jobRunId: r.job_run_id });
      return bindingFor(id);
    };
    const director = (id: number, name: string) => ({ id, name, job: 'Director' });
    await t.test('pending composition, deduplication and safe auto-create stay offline and idempotent', async () => {
      await attach(1, [director(100,'New Director'), director(100,'New Director'), director(101,'Second Director'), { id: 777, name: 'Writer', job: 'Writer' }]);
      const fetchBefore = global.fetch;
      global.fetch = async () => { throw new Error('network forbidden'); };
      try {
        await replay(1);
        assert.equal((await client`select count(*)::int n from creators`)[0].n, 0);
        assert.deepEqual(await getFilmDirectorDisplay(1), [{ name:'New Director',creatorId:null,slug:null }, { name:'Second Director',creatorId:null,slug:null }]);
        assert.equal((await requests.autoApproveTmdbCompanyRequests({ externalIds:['person:100'] })).approved, 0);
        const b = await approve(100);
        await approve(101);
        await replay(1);
        await replay(1);
        assert.equal((await client`select count(*)::int n from entry_creator_sources where entry_id=1`)[0].n, 2);
        assert.equal((await client`select count(*)::int n from creators`)[0].n, 2);
        assert.equal((await getFilmDirectorDisplay(1))[0].creatorId,b.creator_id);
        assert.deepEqual((await client`select facts from media_item_metadata where media_item_id=1`)[0].facts,{ kept:true });
      } finally { global.fetch=fetchBefore; }
    });
    await t.test('invalid or missing evidence rolls back; empty valid roster preserves manual participation', async () => {
      const b = await bindingFor(100);
      await client`update entry_creators set is_manual=true where entry_id=1 and creator_id=${b.creator_id}`;
      for (const damaged of [null, [{ job:'Director',id:0,name:'Invalid' }], [director(100,'New Director'),null], [director(100,'One'),director(100,'Two')]]) {
        await attach(1,damaged);
        await assert.rejects(replay(1));
        assert.equal((await client`select count(*)::int n from entry_creator_sources where entry_id=1`)[0].n,2);
      }
      await client`delete from provider_snapshot_links where entity_id='1' and entity_type='media-item'`;
      await assert.rejects(replay(1));
      await attach(1,[]);
      await replay(1);
      assert.equal((await client`select count(*)::int n from entry_creator_sources where entry_id=1`)[0].n,0);
      assert.equal((await getFilmDirectorDisplay(1))[0].creatorId,b.creator_id);
      assert.equal((await client`select count(*)::int n from entry_creators where entry_id=1`)[0].n,1);
    });
    await t.test('same-name cross-provider person requires explicit mapping', async () => {
      const existing = await creators.createCreator({ name:'Known Person',slug:'known-person',typeId:person.id });
      await client`insert into provider_creator_bindings(provider,external_creator_id,creator_id) values('fantlab','200',${existing.id})`;
      await attach(2,[director(200,'Known Person')]); await replay(2);
      assert.deepEqual(await requests.autoApproveTmdbDirectorRequests({ externalIds:['person:200'] }),{ approved:0,skipped:1 });
      assert.equal(await bindingFor(200),undefined);
      await apply(await requests.resolveCreatorRequest({ requestId:(await requestFor(200)).id,adminId:1,decision:'map',creatorId:existing.id }));
      assert.equal((await getFilmDirectorDisplay(2))[0].creatorId,existing.id);
      assert.equal((await client`select count(*)::int n from provider_creator_bindings where creator_id=${existing.id}`)[0].n,2);
    });
    await t.test('reopen, exclusion and repeated provider import preserve manual decisions', async () => {
      const binding=await bindingFor(200);
      await apply(await requests.reopenCreatorBinding({ bindingId:binding.id,adminId:1 }));
      assert.equal((await requests.autoApproveTmdbDirectorRequests({ externalIds:['person:200'] })).approved,0);
      await replay(2);
      assert.equal((await getFilmDirectorDisplay(2))[0].creatorId,null);
      await apply(await requests.resolveCreatorRequest({ requestId:(await requestFor(200)).id,adminId:1,decision:'exclude' }));
      await replay(2);
      assert.deepEqual(await getFilmDirectorDisplay(2),[]);
      assert.equal((await requests.autoApproveTmdbDirectorRequests({ externalIds:['person:200'] })).approved,0);
    });
    await t.test('company/person namespaces coexist and incompatible mapping is rejected', async () => {
      const company=await creators.createCreator({ name:'Film Studio',slug:'film-studio',typeId:organization.id });
      await client`insert into provider_creator_bindings(provider,external_creator_id,creator_id,external_creator_name) values('tmdb','company:300',${company.id},'Film Studio')`;
      await attach(3,[director(300,'Namespace Director')]); await replay(3);
      await assert.rejects(requests.resolveCreatorRequest({ requestId:(await requestFor(300)).id,adminId:1,decision:'map',creatorId:company.id }));
      const b=await approve(300);
      assert.notEqual(b.creator_id,company.id);
      const [owned]=await client`select count(*)::int n from provider_creator_bindings where provider='tmdb' and external_creator_id in ('company:300','person:300')`;
      assert.equal(owned.n,2);
      await attach(4,[director(301,'Another Person')]); await replay(4);
      await assert.rejects(requests.resolveCreatorRequest({ requestId:(await requestFor(301)).id,adminId:1,decision:'map',creatorId:b.creator_id }));
    });
    await t.test('different observed names and name-only collisions remain pending', async () => {
      await attach(4,[director(400,'Variant One')]); await replay(4);
      await attach(5,[director(400,'Variant Two')]); await replay(5);
      assert.equal((await requests.autoApproveTmdbDirectorRequests({ externalIds:['person:400'] })).approved,0);
      await attach(4,[director(401,'New Director')]); await replay(4);
      assert.equal((await requests.autoApproveTmdbDirectorRequests({ externalIds:['person:401'] })).approved,0);
    });
    await t.test('aliases, original names and inactive history cannot silently merge people', async () => {
      const b=await bindingFor(100);
      await client`update creators set original_name='Original Person' where id=${b.creator_id}`;
      await client`insert into provider_creator_mappings(provider,media_type,external_creator_name,normalized_external_creator_name,creator_id) values('fantlab','book','Alias Person','alias person',${b.creator_id})`;
      for (const [id,name] of [[500,'Alias Person'],[501,'Original Person']] as const) {
        await attach(4,[director(id,name)]); await replay(4);
        assert.equal((await requests.autoApproveTmdbDirectorRequests({ externalIds:[`person:${id}`] })).approved,0);
      }
      await client`insert into provider_creator_bindings(provider,external_creator_id,external_creator_name,creator_id,active) values('tmdb','person:502','Historic Person',${b.creator_id},false)`;
      await attach(4,[director(502,'Historic Person')]); await replay(4);
      assert.equal((await requests.autoApproveTmdbDirectorRequests({ externalIds:['person:502'] })).approved,0);
      assert.equal(await bindingFor(502),undefined);
    });
    await t.test('concurrent new IDs with the same name serialize before automatic creation', async () => {
      await client`insert into media_items(id,code,title,media_type,publication_status) values(6,'concurrent-one','One','film','published'),(7,'concurrent-two','Two','film','published')`;
      await attach(6,[director(800,'Concurrent Person')]); await replay(6);
      await attach(7,[director(801,'Concurrent Person')]); await replay(7);
      const results=await Promise.all([800,801].map(id=>requests.autoApproveTmdbDirectorRequests({ externalIds:[`person:${id}`] })));
      assert.equal(results.reduce((n,r)=>n+r.approved,0),1);
      assert.equal(results.reduce((n,r)=>n+r.skipped,0),1);
      assert.equal((await client`select count(*)::int n from creators where name='Concurrent Person'`)[0].n,1);
    });
    await t.test('generated director mutation SQL has PostgreSQL plans without executing writes', async () => {
      client.options.debug = false;
      assert.ok(mutations.size>10);
      for (const item of mutations.values()) await client.unsafe('explain (format json) '+item.query,item.params as never[]);
      t.diagnostic(`Validated ${mutations.size} distinct generated mutation statements with EXPLAIN, without executing them.`);
    });
  } finally {
    await client.unsafe(`drop schema if exists ${schema} cascade`);
    await client.end();
  }
});
