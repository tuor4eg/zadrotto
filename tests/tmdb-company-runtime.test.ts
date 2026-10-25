import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { test } from "node:test";
import { and, asc, eq, gt, sql } from "drizzle-orm";

const testUrl = process.env.TMDB_COMPANIES_TEST_DATABASE_URL;

test("TMDB companies use ordinary moderation and preserve provenance offline", { skip: !testUrl }, async (t) => {
  const schema = `tmdb_companies_${Date.now()}`;
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
      CREATE TABLE domain_event_outbox(event_id uuid PRIMARY KEY REFERENCES domain_events(id),dispatched_at timestamptz,created_at timestamptz DEFAULT now(),updated_at timestamptz DEFAULT now());`);
    const { syncTmdbCompanyCreators, syncTmdbFilmCompanies } = await import("../src/db/queries/tmdb-companies");
    const { getFilmCompanyDisplay } = await import("../src/db/queries/tmdb-company-display");
    const { extractTmdbCompanyReferences } = await import("../src/lib/creators/tmdb-companies");
    const { normalizeSearchText } = await import("../src/lib/search/normalize");
    const mutations = new Map<string, { query: string; params: unknown[] }>();
    client.options.debug = (_connection, query, params) => {
      if (/^(insert into|update|delete from) "(creators|creator_requests|creator_request_media_items|entry_creators|entry_creator_sources|provider_creator_bindings|provider_creator_exclusions|game_company_profiles|media_item_metadata|job_runs)"/.test(query)) mutations.set(query, { query, params: [...params] });
    };
    const organization = (await creators.getCreatorTypes()).find(row => row.code === 'organization')!;
    const productionRole = (await creators.getCreatorRoles()).find(row => row.code === 'production_company')!;
    await client`update media_items set media_type='film'`;
    const refs = (id: number, name = 'New Film Studio') => extractTmdbCompanyReferences({ providerCode: 'tmdb', externalId: '42', payload: { id: 42, production_companies: [{ id, name, logo_path: null }] } });
    const save = (id: number, references: ReturnType<typeof refs>) => db.transaction(async tx => {
      await tx.select({ id: mediaItems.id }).from(mediaItems).where(sql`${mediaItems.id}=${id}`).for('update');
      return syncTmdbCompanyCreators(tx, id, references);
    });
    const requestFor = async (externalId: string) => (await client`select * from creator_requests where provider='tmdb' and external_creator_id=${externalId}`)[0];
    const bindingFor = async (externalId: string) => (await client`select * from provider_creator_bindings where provider='tmdb' and external_creator_id=${externalId} and active`)[0];
    const apply = async (decision: { requestId: number; jobRunId: number }) => {
      await requests.applyCreatorRequest(decision.requestId, { jobRunId: decision.jobRunId });
      await client`update job_runs set status='succeeded' where id=${decision.jobRunId}`;
    };
    const { snapshotHash } = await import("../src/lib/providers/snapshot-values");
    const { describeTmdbFilmSource } = await import("../src/lib/providers/tmdb-film-adapter");
    const attach = async (id: number, companies: unknown) => {
      await client`insert into media_item_metadata(media_item_id,source_provider,source_external_id,facts) values(${id},'tmdb',${String(id)},'{"productionCompanies":["Legacy"],"runtimeMinutes":123,"kept":true}') on conflict(media_item_id) do update set source_provider='tmdb',source_external_id=excluded.source_external_id,facts=excluded.facts`;
      const payload = { id, production_companies: companies };
      await client`delete from provider_snapshot_links where entity_type='media-item' and entity_id=${String(id)}`;
      const [snapshot] = await client`insert into provider_snapshots(provider_code,resource_type,external_id,api_method,request_params,request_key,payload,content_type,payload_hash,request_started_at,fetched_at)
        values('tmdb','movie',${String(id)},'movie.details','{"language":"ru-RU","append_to_response":"credits"}',${snapshotHash(describeTmdbFilmSource(String(id)).requestParams)},${JSON.stringify(payload)}::jsonb,'application/json',${'a'.repeat(64)},now(),now())
        on conflict(provider_code,resource_type,external_id,api_method,request_key) do update set payload=excluded.payload returning id`;
      await client`insert into provider_snapshot_links(snapshot_id,entity_type,entity_id,purpose) values(${snapshot.id},'media-item',${String(id)},'primary')`;
    };
    const replay = (id: number) => db.transaction(async tx => {
      await tx.select({ id: mediaItems.id }).from(mediaItems).where(sql`${mediaItems.id}=${id}`).for('update');
      return syncTmdbFilmCompanies(tx, id, { enqueueLogos: false });
    });
    await t.test('registration never creates organizations; automatic create is an ordinary queued decision', async () => {
      await attach(1, [{ id: 100, name: 'New Film Studio', logo_path: null }]);
      await replay(1);
      assert.equal((await client`select count(*)::int n from creators`)[0].n, 0);
      assert.equal((await requestFor('company:100')).decision, null);
      assert.deepEqual(await getFilmCompanyDisplay(1), [{ name: 'New Film Studio', creatorId: null, slug: null }]);
      assert.deepEqual((await client`select facts from media_item_metadata where media_item_id=1`)[0].facts, { runtimeMinutes: 123, kept: true });
      assert.deepEqual(await requests.autoApproveTmdbCompanyRequests({ externalIds: ['company:100'] }), { approved: 1, skipped: 0 });
      const request = await requestFor('company:100');
      assert.equal(request.decision, 'create');
      assert.equal((await client`select type from job_runs where id=${request.job_run_id}`)[0].type, 'media.creator-request-apply');
      await apply({ requestId: request.id, jobRunId: request.job_run_id });
      const binding = await bindingFor('company:100');
      assert.ok(binding);
      const imageJobs = await client`select payload from job_runs where type='media.creator-image-fill'`;
      assert.ok(imageJobs.some(row => row.payload.creatorId === binding.creator_id && /^[a-f0-9]{64}$/.test(row.payload.bindingFingerprint)));
      assert.equal((await getFilmCompanyDisplay(1))![0].creatorId, binding.creator_id);
      assert.equal((await client`select is_manual from entry_creators where entry_id=1 and creator_id=${binding.creator_id} and role_id=${productionRole.id}`)[0].is_manual, false);
      await replay(1);
      assert.equal((await client`select count(*)::int n from creators`)[0].n, 1);
      assert.equal((await client`select count(*)::int n from entry_creator_sources where entry_id=1`)[0].n, 1);
    });
    await t.test('offline replay is atomic and preserves manual participation and other provenance', async () => {
      const binding = await bindingFor('company:100');
      await creators.setManualEntryCreators(1, [{ creatorId: binding.creator_id, roleId: productionRole.id }]);
      await client`insert into entry_creator_sources(entry_id,creator_id,role_id,provider,normalized_external_creator_name) values(1,${binding.creator_id},${productionRole.id},'igdb','other source')`;
      const oldFetch = globalThis.fetch;
      globalThis.fetch = async () => { throw new Error('OFFLINE_TEST'); };
      try {
        await attach(1, []);
        await replay(1);
      } finally { globalThis.fetch = oldFetch; }
      assert.equal((await client`select count(*)::int n from entry_creator_sources where entry_id=1 and provider='tmdb'`)[0].n, 0);
      assert.equal((await client`select count(*)::int n from entry_creator_sources where entry_id=1 and provider='igdb'`)[0].n, 1);
      assert.equal((await client`select is_manual from entry_creators where entry_id=1`)[0].is_manual, true);
      await attach(1, [{ name: 'Missing identity' }]);
      const before = await client`select facts from media_item_metadata where media_item_id=1`;
      assert.equal(await getFilmCompanyDisplay(1), undefined, 'legacy facts fallback remains until successful replay');
      await assert.rejects(replay(1));
      assert.deepEqual(await client`select facts from media_item_metadata where media_item_id=1`, before);
      await client`delete from provider_snapshot_links where entity_type='media-item' and entity_id='1'`;
      await assert.rejects(replay(1));
      assert.deepEqual(await client`select facts from media_item_metadata where media_item_id=1`, before);
    });
    await t.test('exact original name maps across providers but conflicting IDs and ambiguity require review', async () => {
      const company = await creators.createCreator({ name: 'Компания', originalName: 'Original Studio', slug: 'original-studio', typeId: organization.id });
      await attach(2, [{ id: 200, name: ' ORIGINAL   Studio ', logo_path: null }]);
      await replay(2);
      assert.equal((await requests.autoApproveTmdbCompanyRequests({ externalIds: ['company:200'] })).approved, 1);
      assert.equal((await bindingFor('company:200')).creator_id, company.id);
      const decision = await requestFor('company:200');
      await apply({ requestId: decision.id, jobRunId: decision.job_run_id });
      await save(3, refs(201, 'Original Studio'));
      assert.deepEqual(await requests.autoApproveTmdbCompanyRequests({ externalIds: ['company:201'] }), { approved: 0, skipped: 1 });
      assert.equal((await requestFor('company:201')).decision, null);
      for (const slug of ['ambiguous-one', 'ambiguous-two']) await creators.createCreator({ name: 'Ambiguous Studio', slug, typeId: organization.id });
      await save(4, refs(400, 'Ambiguous Studio'));
      assert.equal((await requests.autoApproveTmdbCompanyRequests({ externalIds: ['company:400'] })).approved, 0);
      await save(5, refs(500, 'Variant One'));
      await save(4, refs(500, 'Variant Two'));
      assert.equal((await requests.autoApproveTmdbCompanyRequests({ externalIds: ['company:500'] })).approved, 0);
      assert.equal((await requestFor('company:500')).decision, null);
    });
    await t.test('reopen and exclusion persist and block automatic reapproval', async () => {
      const binding = await bindingFor('company:200');
      const reopened = await requests.reopenCreatorBinding({ bindingId: binding.id, adminId: 1 });
      await apply(reopened);
      await save(2, refs(200, 'Original Studio'));
      assert.equal((await requests.autoApproveTmdbCompanyRequests({ externalIds: ['company:200'] })).approved, 0);
      assert.equal((await requestFor('company:200')).manually_reopened, true);
      await apply(await requests.resolveCreatorRequest({ requestId: (await requestFor('company:200')).id, adminId: 1, decision: 'exclude' }));
      await save(2, refs(200, 'Original Studio'));
      assert.equal((await requests.autoApproveTmdbCompanyRequests({ externalIds: ['company:200'] })).approved, 0);
      assert.equal((await requestFor('company:200')).decision, 'exclude');
      assert.deepEqual(await getFilmCompanyDisplay(2), []);
      assert.equal((await client`select count(*)::int n from provider_creator_exclusions where provider='tmdb' and external_creator_id='company:200'`)[0].n, 1);
    });
    await t.test('public companies respect name-only exclusions and inactive bindings immediately', async () => {
      assert.equal((await getFilmCompanyDisplay(4))?.some(row => row.name === 'Variant Two'), true);
      await client`insert into provider_creator_exclusions(provider,media_type,external_creator_name,normalized_external_creator_name) values('tmdb','film','Variant Two','variant two')`;
      assert.equal((await getFilmCompanyDisplay(4))?.some(row => row.name === 'Variant Two'), false);
      const [company] = await client`insert into creators(name,slug,type_id) values('Inactive Company','inactive-company',${organization.id}) returning id`;
      const [binding] = await client`insert into provider_creator_bindings(provider,external_creator_id,creator_id,external_creator_name) values('tmdb','company:707',${company.id},'Inactive Company') returning id`;
      await client`insert into entry_creators(entry_id,creator_id,role_id,is_manual) values(3,${company.id},${productionRole.id},false)`;
      await client`insert into entry_creator_sources(entry_id,creator_id,role_id,provider,normalized_external_creator_name,binding_id) values(3,${company.id},${productionRole.id},'tmdb','tmdb:company:707',${binding.id})`;
      assert.equal((await getFilmCompanyDisplay(3))?.some(row => row.creatorId === company.id), true);
      await client`update provider_creator_bindings set active=false where id=${binding.id}`;
      assert.equal((await getFilmCompanyDisplay(3))?.some(row => row.creatorId === company.id), false);
    });
    await t.test('company namespace and composite binding owner remain enforced by PostgreSQL', async () => {
      const binding = await bindingFor('company:100');
      for (const id of ['100', 'developer:100', 'company:0']) await assert.rejects(client`insert into provider_creator_bindings(provider,external_creator_id,creator_id,external_creator_name) values('tmdb',${id},${binding.creator_id},'Invalid')`);
      await assert.rejects(client`insert into provider_creator_bindings(provider,external_creator_id,creator_id,external_creator_name) values('tmdb','company:100',${binding.creator_id},'Duplicate')`);
      const other = (await client`select id from creators where id<>${binding.creator_id} limit 1`)[0];
      await client`insert into entry_creators(entry_id,creator_id,role_id,is_manual) values(5,${other.id},${productionRole.id},false) on conflict do nothing`;
      await assert.rejects(client`insert into entry_creator_sources(entry_id,creator_id,role_id,provider,normalized_external_creator_name,binding_id) values(5,${other.id},${productionRole.id},'tmdb','wrong owner',${binding.id})`);
    });
    await t.test('saved name-only administrative mappings precede canonical names and reject person owners', async () => {
      await client`insert into media_items(id,code,title,media_type,publication_status) values(22,'mapped-alias','Mapped alias','film','published'),(23,'mapped-person','Mapped person','film','published')`;
      const company = await creators.createCreator({ name: 'Canonical Organization', slug: 'canonical-organization', typeId: organization.id });
      const personType = (await creators.getCreatorTypes()).find(row => row.code === 'person')!;
      const person = await creators.createCreator({ name: 'Person Owner', slug: 'person-owner', typeId: personType.id });
      for (const [id, name, creatorId] of [[22, 'Saved Company Alias', company.id], [23, 'Saved Person Alias', person.id]] as const) {
        await client`insert into provider_creator_mappings(provider,media_type,external_creator_name,normalized_external_creator_name,creator_id) values('tmdb','film',${name},${normalizeSearchText(name)},${creatorId})`;
        await attach(id, [{ id: id * 100, name, logo_path: null }]);
        await replay(id);
      }
      const mappingQueries: Array<{ query: string; params: unknown[] }> = [];
      const previousDebug = client.options.debug;
      client.options.debug = (connection, query, params, types) => {
        if (typeof previousDebug === 'function') previousDebug(connection, query, params, types);
        if (query.startsWith('select') && query.includes('from "provider_creator_mappings"')) mappingQueries.push({ query, params: [...params] });
      };
      try {
        assert.deepEqual(await requests.autoApproveTmdbCompanyRequests({ externalIds: ['company:2200'] }), { approved: 1, skipped: 0 });
        assert.equal((await requestFor('company:2200')).decision, 'map');
        assert.equal((await bindingFor('company:2200')).creator_id, company.id);
        assert.equal((await client`select count(*)::int n from creators where name='Saved Company Alias'`)[0].n, 0);
        assert.deepEqual(await requests.autoApproveTmdbCompanyRequests({ externalIds: ['company:2300'] }), { approved: 0, skipped: 1 });
        assert.equal((await requestFor('company:2300')).decision, null);
        assert.equal(await bindingFor('company:2300'), undefined);
      } finally { client.options.debug = previousDebug; }
      assert.equal(mappingQueries.length, 2);
      for (const item of mappingQueries) {
        assert.match(item.query, /normalized_external_creator_name/);
        const [row] = await client.unsafe('explain(analyze,buffers,format json) ' + item.query, item.params as never[]);
        assert.equal(row['QUERY PLAN'][0].Plan['Actual Rows'], 1);
        t.diagnostic(JSON.stringify({ savedMappingExactLookup: true, sql: item.query, params: item.params, plan: row['QUERY PLAN'][0].Plan }));
      }
    });
    await t.test('concurrent imports and automatic decisions create one organization for one TMDB ID', async () => {
      await client`insert into media_items(id,code,title,media_type,publication_status) values(20,'concurrent-one','Concurrent one','film','published'),(21,'concurrent-two','Concurrent two','film','published')`;
      for (const id of [20, 21]) await attach(id, [{ id: 2021, name: 'Concurrent Film Company', logo_path: null }]);
      await Promise.all([replay(20), replay(21)]);
      const results = await Promise.all([requests.autoApproveTmdbCompanyRequests({ externalIds: ['company:2021'] }), requests.autoApproveTmdbCompanyRequests({ externalIds: ['company:2021'] })]);
      assert.equal(results.reduce((sum, result) => sum + result.approved, 0), 1);
      assert.equal((await client`select count(*)::int n from creators where name='Concurrent Film Company'`)[0].n, 1);
      assert.equal((await client`select count(*)::int n from creator_requests where provider='tmdb' and external_creator_id='company:2021'`)[0].n, 1);
      const request = await requestFor('company:2021');
      await apply({ requestId: request.id, jobRunId: request.job_run_id });
      const binding = await bindingFor('company:2021');
      assert.deepEqual((await client`select entry_id from entry_creators where creator_id=${binding.creator_id} order by entry_id`).map(row => row.entry_id), [20, 21]);
    });
    await t.test('normal metadata upsert uses trusted snapshots and rejects stale hash, source and job lease atomically', async () => {
      await client.unsafe(`create table genres(id serial primary key,slug text,name text,is_active boolean default true);
        create table media_item_genres(media_item_id integer,genre_id integer,provider text,is_manual boolean default false,created_at timestamptz default now(),updated_at timestamptz default now(),primary key(media_item_id,genre_id));
        create table platforms(id serial primary key,slug text,name text,is_active boolean default true);
        create table media_item_platforms(media_item_id integer,platform_id integer,provider text,is_manual boolean default false,created_at timestamptz default now(),updated_at timestamptz default now(),primary key(media_item_id,platform_id));
        create table genre_request_media_items(request_id integer,media_item_id integer,external_genre_name text,external_genre_id text);
        create table platform_request_media_items(request_id integer,media_item_id integer,external_platform_name text);
        insert into media_items(id,code,title,media_type,publication_status) values(9,'normal-upsert','Manual film name','film','published');`);
      await attach(9, [{ id: 909, name: 'Upsert Studio', logo_path: null }]);
      const payload = { id: 9, runtime: 90, original_language: 'fr', production_countries: [{ name: 'France' }], production_companies: [{ id: 909, name: 'Upsert Studio', logo_path: null }], genres: [], credits: { cast: [], crew: [] } };
      await client`update provider_snapshots set payload=${JSON.stringify(payload)}::jsonb,payload_hash=${snapshotHash(payload)} where external_id='9'`;
      const snapshot = (await client`select id,payload_hash from provider_snapshots where external_id='9'`)[0];
      const { upsertMediaItemMetadata } = await import('../src/db/queries/media-item-metadata');
      const base = { mediaItemId: 9, sourceProvider: 'tmdb', sourceExternalId: '9', facts: { productionCompanies: ['Forged'], runtimeMinutes: 999 }, enqueueCompanyLogos: false,
        snapshotReferences: [{ id: snapshot.id, payloadHash: snapshot.payload_hash }] };
      const oldFetch = globalThis.fetch;
      globalThis.fetch = async () => { throw new Error('NORMAL_UPSERT_MUST_NOT_FETCH'); };
      try {
        await upsertMediaItemMetadata(base);
        assert.equal((await requestFor('company:909')).external_creator_name, 'Upsert Studio');
        const before = await client`select facts from media_item_metadata where media_item_id=9`;
        assert.deepEqual(before[0].facts, { runtimeMinutes: 90, originalLanguage: 'fr', productionCountries: ['France'], kept: true });
        assert.equal((await client`select title from media_items where id=9`)[0].title, 'Manual film name');
        await assert.rejects(upsertMediaItemMetadata({ ...base, snapshotReferences: [{ id: snapshot.id, payloadHash: '0'.repeat(64) }] }), /PROVIDER_SNAPSHOT_CHANGED/);
        await assert.rejects(upsertMediaItemMetadata({ ...base, expectedSource: { provider: 'tmdb', externalId: 'changed' } }), /PROVIDER_SOURCE_CHANGED/);
        const [run] = await client`insert into job_runs(type,source,status,lock_token,lock_expires_at,payload) values('provider.snapshots','manual','running','upsert-token',now()-interval '1 second','{"checkpoint":"original"}') returning id`;
        await assert.rejects(upsertMediaItemMetadata({ ...base, jobGuard: { runId: run.id, lockToken: 'upsert-token' }, checkpoint: { checkpoint: 'changed' } }));
        assert.deepEqual((await client`select payload from job_runs where id=${run.id}`)[0].payload, { checkpoint: 'original' });
        assert.deepEqual(await client`select facts from media_item_metadata where media_item_id=9`, before);
        await client`update job_runs set lock_expires_at=now()+interval '1 hour' where id=${run.id}`;
        await upsertMediaItemMetadata({ ...base, jobGuard: { runId: run.id, lockToken: 'upsert-token' }, checkpoint: { checkpoint: 'done' } });
        assert.deepEqual((await client`select payload from job_runs where id=${run.id}`)[0].payload, { checkpoint: 'done' });
        const company = await bindingFor('company:100');
        await apply(await requests.resolveCreatorRequest({ requestId: (await requestFor('company:909')).id, adminId: 1, decision: 'map', creatorId: company.creator_id }));
        await creators.setManualEntryCreators(9, [{ creatorId: company.creator_id, roleId: productionRole.id }]);
        await client`insert into entry_creator_sources(entry_id,creator_id,role_id,provider,normalized_external_creator_name) values(9,${company.creator_id},${productionRole.id},'igdb','other company provenance')`;
        await upsertMediaItemMetadata({ mediaItemId: 9, sourceProvider: 'tmdb', sourceExternalId: '99', facts: {}, fetchedAt: null });
        assert.equal((await client`select count(*)::int n from entry_creator_sources where entry_id=9 and provider='tmdb'`)[0].n, 0);
        assert.equal((await client`select count(*)::int n from entry_creator_sources where entry_id=9 and provider='igdb'`)[0].n, 1);
        assert.equal((await client`select count(*)::int n from creator_request_media_items where media_item_id=9`)[0].n, 0);
        assert.equal((await client`select is_manual from entry_creators where entry_id=9 and creator_id=${company.creator_id}`)[0].is_manual, true);

      } finally { globalThis.fetch = oldFetch; }
    });
    await t.test('generated domain mutations have valid PostgreSQL plans without executing writes', async () => {
      assert.ok(mutations.size > 10);
      client.options.debug = false;
      for (const item of mutations.values()) {
        const [row] = await client.unsafe('explain(format json) ' + item.query, item.params as never[]);
        t.diagnostic(JSON.stringify({ mutationPlanOnly: true, sql: item.query, plan: row['QUERY PLAN'][0].Plan }));
      }
      t.diagnostic(`Validated ${mutations.size} distinct generated mutation statements using EXPLAIN without ANALYZE.`);
    });
    await t.test('representative SQL plans cover exact candidates, request memberships and mixed-media tabs', { skip: process.env.TMDB_COMPANIES_PERF_TEST !== '1' }, async () => {
      await client.unsafe(`insert into creators(id,name,slug,type_id)
        select 10000+g,'Perf Studio '||g,'perf-studio-'||g,${organization.id} from generate_series(0,10000)g;
        insert into media_items(id,code,title,media_type,publication_status)
        select 1000+g,'perf-entry-'||g,'Perf entry '||g,case when g%3=0 then 'game' when g%3=1 then 'film' else 'series' end,'published' from generate_series(1,100000)g;
        insert into entry_creators(entry_id,creator_id,role_id,is_manual)
        select 1000+g,10001+((g+n*997)%10000),${productionRole.id},false from generate_series(1,100000)g cross join generate_series(0,8)n;
        insert into entry_creators(entry_id,creator_id,role_id,is_manual)
        select 1000+g,10000,${productionRole.id},false from generate_series(1,100000)g;
        analyze creators; analyze media_items; analyze entry_creators;`);
      await client`insert into creators(id,name,slug,type_id) values(30000,'Perf Exact','perf-exact',${organization.id})`;
      const [request] = await client`insert into creator_requests(provider,media_type,external_creator_id,external_creator_name,normalized_external_creator_name)
        values('tmdb','film','company:888888','Perf Exact','perf exact') returning id`;
      await client`insert into creator_request_media_items(request_id,media_item_id,role_id,external_creator_name)
        select ${request.id},id,${productionRole.id},'Perf Exact' from media_items where id>1000`;
      await client.unsafe('analyze creator_request_media_items; analyze creator_requests');
      await client.unsafe(`insert into game_company_profiles(provider,external_id,name,image_url,profile_status,image_status)
        select 'tmdb','company:'||(1000000+g),'Perf Logo '||g,case when g%10=0 then 'https://image.tmdb.org/t/p/original/logo.png' else null end,'ready',case when g%20=0 then 'ready' else 'missing' end from generate_series(1,100000)g;
        insert into provider_creator_bindings(provider,external_creator_id,creator_id,external_creator_name)
        select 'tmdb','company:'||(1000000+g),10000+(g%10001),'Perf Logo '||g from generate_series(1,100000)g;
        analyze game_company_profiles; analyze provider_creator_bindings;`);

      const captured: Array<{ query: string; params: unknown[] }> = [];
      client.options.debug = (_connection, query, params) => {
        if (query.startsWith('select') && !query.includes('pg_advisory')) captured.push({ query, params: [...params] });
      };
      const { getCatalogMediaTypeCounts } = await import('../src/db/queries/media-items');
      const { gameCompanyProfiles, providerCreatorBindings } = await import('../src/db/schema');
      try {
        for (const cursor of ['company:1005000', 'company:999999999']) await db.select({ externalId: gameCompanyProfiles.externalId }).from(gameCompanyProfiles)
          .where(and(eq(gameCompanyProfiles.provider, 'tmdb'), eq(gameCompanyProfiles.profileStatus, 'ready'), sql`${gameCompanyProfiles.imageUrl} is not null`, gt(gameCompanyProfiles.externalId, cursor)))
          .orderBy(asc(gameCompanyProfiles.externalId)).limit(25);
        await db.select({ binding: providerCreatorBindings, profile: gameCompanyProfiles }).from(providerCreatorBindings)
          .innerJoin(gameCompanyProfiles, and(eq(gameCompanyProfiles.provider, providerCreatorBindings.provider), eq(gameCompanyProfiles.externalId, providerCreatorBindings.externalCreatorId)))
          .where(and(eq(providerCreatorBindings.creatorId, 10000), eq(providerCreatorBindings.provider, 'tmdb'), eq(providerCreatorBindings.active, true), eq(gameCompanyProfiles.imageStatus, 'ready')))
          .orderBy(asc(providerCreatorBindings.externalCreatorId));
        await db.select().from(providerCreatorBindings).where(and(eq(providerCreatorBindings.provider, 'tmdb'), eq(providerCreatorBindings.externalCreatorId, 'company:1000020'), eq(providerCreatorBindings.active, true)));
        await getFilmCompanyDisplay(1001);
        const tabCodes = await creators.getCreatorMediaTypeCodes(10000, ['film', 'game', 'series']);
        assert.deepEqual([...tabCodes].sort(), ['film', 'game', 'series']);
        for (const creatorId of [10000, 10001, 99999999]) {
          const counts = await getCatalogMediaTypeCounts({ authorRatingFilter: 'all', enabledMediaTypeCodes: ['film', 'game', 'series'], searchQuery: '', yearFilter: null, yearMode: 'release', creatorId });
          assert.equal(counts.reduce((sum, row) => sum + row.count, 0), creatorId === 10000 ? 100000 : creatorId === 10001 ? 90 : 0);
          await db.select({ id: mediaItems.id }).from(mediaItems).where(creators.creatorCondition(creatorId)).orderBy(mediaItems.id).limit(25);
        }
        assert.equal((await requests.autoApproveTmdbCompanyRequests({ externalIds: ['company:888888'] })).approved, 1);
      } finally { client.options.debug = false; }
      assert.ok(captured.some(item => item.query.includes('creator_request_media_items')));
      assert.ok(captured.some(item => item.query.includes('regexp_replace')));
      assert.ok(captured.some(item => item.query.includes('entry_creators')));
      const candidateQuery = captured.find(item => item.query.includes('regexp_replace') && item.query.includes('"creators"'))!;
      const indexes = readFileSync('drizzle/0135_tmdb_company_creators.sql', 'utf8').split('--> statement-breakpoint').filter(statement => /CREATE INDEX creators_(name|original_name)_exact_idx/.test(statement));
      assert.equal(indexes.length, 2);
      const definitions = await client`select indexdef from pg_indexes where schemaname=${schema} and indexname in ('creators_name_exact_idx','creators_original_name_exact_idx')`;
      t.diagnostic(JSON.stringify({ exactNameIndexes: definitions.map(row => row.indexdef) }));
      await client.unsafe('drop index creators_name_exact_idx; drop index creators_original_name_exact_idx');
      const [baseline] = await client.unsafe('explain(analyze,buffers,format json) ' + candidateQuery.query, candidateQuery.params as never[]);
      const before = baseline['QUERY PLAN'][0];
      t.diagnostic(JSON.stringify({ exactNameBefore: true, executionMs: before['Execution Time'], plan: before.Plan }));
      for (const statement of indexes) await client.unsafe(statement);
      await client.unsafe('analyze creators');
      for (const item of captured) {
        const [row] = await client.unsafe('explain(analyze,buffers,format json) ' + item.query, item.params as never[]);
        const plan = row['QUERY PLAN'][0];
        if (item === candidateQuery) assert.match(JSON.stringify(plan), /creators_(name|original_name)_exact_idx/, 'exact normalized-name candidate SQL matches migration indexes');
        t.diagnostic(JSON.stringify({ entries: 100000, participations: 1000000, organizations: 10001, sql: item.query, params: item.params, executionMs: plan['Execution Time'], plan: plan.Plan }));
      }
    });
  } finally {
    client.options.debug = false;
    await client.unsafe(`DROP SCHEMA IF EXISTS ${schema} CASCADE`);
    await client.end();
  }
});
