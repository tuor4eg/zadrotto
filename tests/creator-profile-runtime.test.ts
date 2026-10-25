import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { test } from "node:test";
import { creatorProfileDescriptor, type CreatorProfileTarget } from "../src/lib/providers/creator-profile-targets";

const testUrl = process.env.CREATOR_PROFILES_TEST_DATABASE_URL;

test("Creator raw snapshots are independent of entities and attachment preserves working data", { skip: !testUrl }, async t => {
  const schema = `creator_profiles_${process.pid}_${Date.now()}`;
  const url = new URL(testUrl!);
  url.searchParams.set("options", `-c search_path=${schema}`);
  process.env.DATABASE_URL = url.toString();
  process.env.DATABASE_MAX_CONNECTIONS = "3";
  const { db, getDbClient } = await import("../src/db");
  const snapshots = await import("../src/db/queries/provider-snapshots");
  const profiles = await import("../src/db/queries/creator-profile-snapshots");
  const client = getDbClient();
  try {
    await client.unsafe(`create schema ${schema};
      create table creator_types(id integer primary key,name text,code text);
      insert into creator_types values(1,'Organization','organization');
      create table creators(id integer primary key,name text,slug text,original_name text,type_id integer,
        birth_date date,death_date date,avatar_object_key text,avatar_source text,avatar_source_external_id text,
        avatar_source_url text,avatar_original_url text,avatar_fetched_at timestamptz,avatar_content_hash text,
        avatar_version integer default 0,created_at timestamptz default now(),updated_at timestamptz default now(),name_ru text,name_ru_source text,name_ru_processed boolean default false);
      create table provider_creator_bindings(id integer primary key,provider text,external_creator_id text,
        creator_id integer references creators(id),active boolean default true,external_creator_name text,
        created_at timestamptz default now(),updated_at timestamptz default now());
      create unique index provider_creator_bindings_identity_unique on provider_creator_bindings(provider,external_creator_id) where active;
      create index provider_creator_bindings_creator_idx on provider_creator_bindings(creator_id);
      create index provider_creator_bindings_active_creator_idx on provider_creator_bindings(provider,creator_id) where active;
      create table job_runs(id integer primary key,status text,lock_token text,lock_expires_at timestamptz,payload jsonb,updated_at timestamptz default now());`);
    // Apply the production snapshot DDL, omitting unrelated ALTERs from this migration.
    for (const statement of readFileSync("drizzle/0127_provider_snapshots.sql", "utf8").split("--> statement-breakpoint").slice(0, 4)) await client.unsafe(statement);
    const target = (provider: CreatorProfileTarget["provider"], resourceType: CreatorProfileTarget["resourceType"], externalId: string): CreatorProfileTarget => ({ provider, resourceType, externalId });
    const save = async (input: CreatorProfileTarget) => snapshots.saveProviderSnapshot({
      ...creatorProfileDescriptor(input), payload: { id: Number(input.externalId), name: "External name", future: { nested: [1, true, null] } },
      payloadHash: "", contentType: "application/json", requestStartedAt: new Date(), fetchedAt: new Date(),
    });
    const tmdb = await save(target("tmdb", "company", "17"));
    const ref = { id: tmdb.id, payloadHash: tmdb.payloadHash };
    await t.test("raw exists before Creator; loading never requires or creates a local entity", async () => {
      assert.equal((await client`select count(*)::int n from creators`)[0].n, 0);
      assert.equal((await client`select count(*)::int n from provider_snapshot_links`)[0].n, 0);
      assert.deepEqual(tmdb.payload, { id: 17, name: "External name", future: { nested: [1, true, null] } });
    });
    await client.unsafe(`insert into creators(id,name,slug,type_id,birth_date,avatar_object_key,avatar_source,avatar_version)
      values(1,'Manual name','manual',1,'1900-01-01','manual.webp','manual',9),(2,'Other','other',1,null,null,null,0);
      insert into provider_creator_bindings(id,provider,external_creator_id,creator_id) values
      (1,'tmdb','company:17',1),(2,'igdb','company:18',1),(3,'rawg','developer:19',1),(4,'rawg','publisher:19',1),
      (5,'bgg','20',1);`);
    const original = (await client`select row_to_json(c) data from creators c where id=1`)[0].data;
    await t.test("multiple providers attach without modifying names, dates, avatars or other links", async () => {
      const inputs = [[1, tmdb], [2, await save(target("igdb", "company", "18"))],
        [3, await save(target("rawg", "developer", "19"))], [4, await save(target("rawg", "publisher", "19"))]] as const;
      for (const [bindingId, snapshot] of inputs) {
        await profiles.attachCreatorProfileSnapshot({ creatorId: 1, bindingId, ref: { id: snapshot.id, payloadHash: snapshot.payloadHash } });
      }
      await profiles.attachCreatorProfileSnapshot({ creatorId: 1, bindingId: 1, ref });
      assert.equal((await client`select count(*)::int n from provider_snapshot_links where entity_type='creator' and entity_id='1'`)[0].n, 4);
      assert.deepEqual((await client`select row_to_json(c) data from creators c where id=1`)[0].data, original);
      const sources = await profiles.getCreatorProfileSources(1);
      assert.equal(sources?.sources.length, 5, "unsupported bindings remain visible alongside supported profiles");
    });
    await t.test("wrong owner, inactive binding and stale reference never attach", async () => {
      await assert.rejects(profiles.attachCreatorProfileSnapshot({ creatorId: 2, bindingId: 1, ref }));
      await client`update provider_creator_bindings set active=false where id=1`;
      await assert.rejects(profiles.attachCreatorProfileSnapshot({ creatorId: 1, bindingId: 1, ref }));
      await client`update provider_creator_bindings set active=true where id=1`;
      await assert.rejects(profiles.attachCreatorProfileSnapshot({ creatorId: 1, bindingId: 1, ref: { ...ref, payloadHash: "stale" } }), /PROVIDER_SNAPSHOT_CHANGED/);
      const wrong = await save(target("tmdb", "company", "999"));
      await assert.rejects(profiles.attachCreatorProfileSnapshot({ creatorId: 1, bindingId: 1, ref: { id: wrong.id, payloadHash: wrong.payloadHash } }));
      assert.equal((await client`select count(*)::int n from provider_snapshot_links where snapshot_id=${wrong.id}`)[0].n, 0);
      assert.deepEqual((await client`select row_to_json(c) data from creators c where id=1`)[0].data, original);
    });
    await t.test("remapping during fetch preserves raw but prevents attachment to former owner", async () => {
      const fetched = await save(target("tmdb", "company", "777"));
      await client`update provider_creator_bindings set external_creator_id='company:777',creator_id=2 where id=1`;
      await assert.rejects(profiles.attachCreatorProfileSnapshot({ creatorId: 1, bindingId: 1, ref: { id: fetched.id, payloadHash: fetched.payloadHash } }));
      assert.ok(await snapshots.getProviderSnapshot(creatorProfileDescriptor(target("tmdb", "company", "777"))));
      assert.equal((await client`select count(*)::int n from provider_snapshot_links where snapshot_id=${fetched.id}`)[0].n, 0);
      await client`update provider_creator_bindings set external_creator_id='company:17',creator_id=1 where id=1`;
    });
    await t.test("expired and stolen job leases cannot commit links", async () => {
      await client`insert into job_runs(id,status,lock_token,lock_expires_at) values(1,'running','current',now()-interval '1 second')`;
      await assert.rejects(profiles.attachCreatorProfileSnapshot({ creatorId: 1, bindingId: 1, ref, jobGuard: { runId: 1, lockToken: "current" } }), /STALE_SNAPSHOT_JOB/);
      await client`update job_runs set lock_expires_at=now()+interval '1 minute' where id=1`;
      await assert.rejects(profiles.attachCreatorProfileSnapshot({ creatorId: 1, bindingId: 1, ref, jobGuard: { runId: 1, lockToken: "stolen" } }), /STALE_SNAPSHOT_JOB/);
    });
    await t.test("bulk only-missing reuses raw, attaches every supported binding and never reapplies working data", async () => {
      const { runCreatorProfileSnapshots } = await import("../src/lib/providers/creator-profile-job");
      const { getSavedCreatorProfileSnapshot, fetchCreatorProfileSnapshot } = await import("../src/lib/providers/creator-profile-service");
      const { parseSnapshotJobPayload } = await import("../src/lib/providers/snapshot-job-payload");
      const { JobError } = await import("../src/lib/jobs/types");
      await client`delete from provider_snapshot_links where entity_type='creator' and entity_id='1'`;
      await client`insert into provider_creator_bindings(id,provider,external_creator_id,creator_id) values(6,'fantlab','900',1),(7,'tmdb','company:55',1)`;
      await snapshots.saveProviderSnapshot({ ...creatorProfileDescriptor(target("fantlab", "author", "900")), payload: { id: 900, autor_id: 900, type: 'autor', is_opened: 1, name: 'External author', biography: '', awards: {}, birthday: '2000-01-01' }, payloadHash: '', contentType: 'application/json', requestStartedAt: new Date(), fetchedAt: new Date() });
      let requests = 0;
      const fetchProfile: typeof fetchCreatorProfileSnapshot = async (input, options) => {
        try { return await getSavedCreatorProfileSnapshot(input); } catch (error) { if (!(error instanceof Error) || error.message !== 'PROVIDER_SNAPSHOT_MISSING') throw error; }
        requests++;
        assert.equal(input.provider, 'tmdb', 'saved FantLab must never be reloaded');
        assert.equal(options.onlyMissing, true);
        return save(input);
      };
      let payload = parseSnapshotJobPayload({ entityType: 'creator', operation: 'refresh', onlyMissingSnapshots: true, creatorIds: [1], batchSize: 2 });
      await client`insert into job_runs(id,status,lock_token,lock_expires_at,payload) values(2,'running','owner',now()+interval '1 hour',${JSON.stringify(payload)}::jsonb)`;
      let iterations = 0;
      for (;;) {
        try { await runCreatorProfileSnapshots(payload, { runId: 2, lockToken: 'owner' }, new AbortController().signal, new Date(0), { fetchProfile, getLimits: async () => [] }); break; }
        catch (error) { assert.ok(error instanceof JobError && error.code === 'provider-continue'); }
        payload = parseSnapshotJobPayload((await client`select payload from job_runs where id=2`)[0].payload);
        assert.ok(++iterations < 5);
      }
      const done = (await client`select payload from job_runs where id=2`)[0].payload;
      assert.equal(done.profileCheckpoint.processed, 6);
      assert.equal(done.profileCheckpoint.failed, 0);
      assert.equal(requests, 1);
      assert.equal((await snapshots.getEntitySnapshotHeaders({ entityType: 'creator', entityId: '1' })).length, 6);
      assert.deepEqual((await client`select row_to_json(c) data from creators c where id=1`)[0].data, original);
      // Service-level cache reuse must also avoid credential lookups and network.
      const oldFetch = globalThis.fetch;
      globalThis.fetch = async () => assert.fail('only-missing must not fetch a saved raw');
      try { await fetchCreatorProfileSnapshot(target('fantlab', 'author', '900'), { signal: new AbortController().signal, onlyMissing: true }); }
      finally { globalThis.fetch = oldFetch; }
      const repeat = parseSnapshotJobPayload({ entityType: 'creator', operation: 'refresh', onlyMissingSnapshots: true, creatorIds: [1] });
      await client`insert into job_runs(id,status,lock_token,lock_expires_at,payload) values(3,'running','owner',now()+interval '1 hour',${JSON.stringify(repeat)}::jsonb)`;
      await runCreatorProfileSnapshots(repeat, { runId: 3, lockToken: 'owner' }, new AbortController().signal, new Date(0), { fetchProfile: async () => assert.fail('complete sources should be skipped'), getLimits: async () => [] });
      assert.equal((await client`select payload from job_runs where id=3`)[0].payload.profileCheckpoint.processed, 0);
    });
    await t.test("external profiles resume by target index without Creator IDs or automatic links", async () => {
      const { runCreatorProfileSnapshots } = await import("../src/lib/providers/creator-profile-job");
      const { parseSnapshotJobPayload } = await import("../src/lib/providers/snapshot-job-payload");
      const { JobError } = await import("../src/lib/jobs/types");
      const input = parseSnapshotJobPayload({ operation: 'refresh', profileTargets: [target('tmdb', 'company', '71'), target('rawg', 'publisher', '72')], batchSize: 1 });
      await client`insert into job_runs(id,status,lock_token,lock_expires_at,payload) values(4,'running','owner',now()+interval '1 hour',${JSON.stringify(input)}::jsonb)`;
      const context = { runId: 4, lockToken: 'owner' };
      const dependencies = { fetchProfile: async (value: CreatorProfileTarget) => save(value), getLimits: async () => [] };
      await assert.rejects(runCreatorProfileSnapshots(input, context, new AbortController().signal, new Date(0), dependencies), error => error instanceof JobError && error.code === 'provider-continue');
      const resume = parseSnapshotJobPayload((await client`select payload from job_runs where id=4`)[0].payload);
      assert.equal(resume.profileCheckpoint?.nextTargetIndex, 1);
      await runCreatorProfileSnapshots(resume, context, new AbortController().signal, new Date(0), dependencies);
      assert.equal((await client`select payload from job_runs where id=4`)[0].payload.profileCheckpoint.processed, 2);
      assert.equal((await client`select count(*)::int n from provider_snapshot_links l join provider_snapshots s on s.id=l.snapshot_id where s.external_id in ('71','72')`)[0].n, 0);
      assert.equal((await client`select count(*)::int n from creators`)[0].n, 2);
    });
    await t.test("binding batches use bounded indexed probes at representative scale", async () => {
      // Disposable benchmark fixtures need no WAL durability.
      await client.unsafe('alter table provider_snapshot_links set unlogged');
      await client.unsafe('alter table provider_snapshots set unlogged');
      const descriptor = creatorProfileDescriptor(target("tmdb", "company", "1"));
      const { snapshotHash } = await import("../src/lib/providers/snapshot-values");
      await client`insert into creators(id,name,type_id) select n,'Synthetic',1 from generate_series(10000,109999) n`;
      await client`insert into provider_creator_bindings(id,provider,external_creator_id,creator_id)
        select n,'tmdb','company:'||n,n from generate_series(10000,109999) n`;
      await client`insert into provider_snapshots(provider_code,resource_type,external_id,api_method,request_key,request_params,payload,payload_hash,content_type,request_started_at,fetched_at)
        select 'tmdb','company',n::text,${descriptor.apiMethod},${snapshotHash(descriptor.requestParams)},'{}'::jsonb,jsonb_build_object('id',n,'name','Synthetic'),'hash','application/json',now(),now() from generate_series(10000,109999) n`;
      await client`insert into provider_snapshot_links(snapshot_id,entity_type,entity_id,purpose)
        select s.id,'creator',(s.external_id::int + k*1000000)::text,'primary' from provider_snapshots s cross join generate_series(0,9) k where s.provider_code='tmdb' and s.external_id::int between 10000 and 109999`;
      await client.unsafe('analyze provider_creator_bindings');
      await client.unsafe('analyze provider_snapshots');
      await client.unsafe('analyze provider_snapshot_links');
      for (const onlyMissingSnapshots of [false,true]) {
        for (const creatorIds of [undefined,[10050],[999999]]) {
          const query = profiles.creatorProfileBindingBatchQuery({afterId:0,throughId:109999,batchSize:25,onlyMissingSnapshots,creatorIds}).toSQL();
          const plan = await client.unsafe('explain (analyze,buffers,format json) '+query.sql,query.params as never[]);
          const report = plan[0]['QUERY PLAN'][0];
          t.diagnostic(JSON.stringify({onlyMissingSnapshots,creatorIds,executionMs:report['Execution Time'],plan:report.Plan}));
        }
      }
      const headerPlan = await client`explain (analyze,buffers,format json) select s.*,exists(select 1 from provider_snapshot_links l where l.snapshot_id=s.id and l.entity_type='creator' and l.entity_id='10050' and l.purpose='primary') linked from provider_snapshots s where provider_code='tmdb' and resource_type='company' and external_id='10050' and api_method=${descriptor.apiMethod} and request_key=${snapshotHash(descriptor.requestParams)}`;
      t.diagnostic(JSON.stringify({sourceLookup:headerPlan[0]['QUERY PLAN']}));
      const attachPlan = await client`explain (format json) insert into provider_snapshot_links(snapshot_id,entity_type,entity_id,purpose) select id,'creator','10050','primary' from provider_snapshots where provider_code='tmdb' and resource_type='company' and external_id='10050' and api_method=${descriptor.apiMethod} and request_key=${snapshotHash(descriptor.requestParams)} on conflict do nothing`;
      t.diagnostic(JSON.stringify({attachWrite:attachPlan[0]['QUERY PLAN']}));
      assert.equal((await profiles.creatorProfileBindingBatchQuery({afterId:9999,throughId:109999,batchSize:25,onlyMissingSnapshots:true})).length,0);
    });
    await t.test("deleting one target's links preserves a shared raw snapshot and another target", async () => {
      await db.transaction(async tx => {
        await snapshots.attachProviderSnapshots(tx, { entityType: "creator", entityId: "2" }, [{ ...ref, purpose: "primary" }], { kind: "system" });
        await snapshots.deleteEntitySnapshotLinks(tx, { entityType: "creator", entityId: "1" });
      });
      assert.equal((await snapshots.getEntitySnapshotHeaders({ entityType: "creator", entityId: "2" })).length, 1);
      assert.equal((await snapshots.getEntitySnapshotHeaders({ entityType: "creator", entityId: "1" })).length, 0);
      assert.ok(await snapshots.getProviderSnapshot(creatorProfileDescriptor(target("tmdb", "company", "17"))));
    });
  } finally {
    await client.unsafe(`drop schema ${schema} cascade`);
    await client.end();
  }
});
