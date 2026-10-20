import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { test } from "node:test";
import type { SnapshotJobPayload } from "../src/lib/providers/snapshot-job-payload";

// Explicit opt-in; every write belongs to a disposable schema, never application tables.
test("creator snapshots: transactional dates, fencing, source CAS and resumable jobs", {
  skip: process.env.CREATOR_SNAPSHOT_TEST !== "1",
}, async t => {
  await import("dotenv/config");
  const { default: postgres } = await import("postgres");
  const originalUrl = process.env.DATABASE_URL!;
  const originalFetch = global.fetch;
  let networkCalls = 0;
  global.fetch = async () => { networkCalls++; throw new Error("Unexpected network call"); };
  const admin = postgres(originalUrl, { max: 1, prepare: false });
  const schema = `creator_snapshot_test_${process.pid}_${Date.now()}`;
  await admin.unsafe(`create schema ${schema}`);
  const url = new URL(originalUrl);
  url.searchParams.set("options", `-c search_path=${schema},public`);
  process.env.DATABASE_URL = url.toString();
  process.env.DATABASE_MAX_CONNECTIONS = "3";
  const { getDbClient } = await import("../src/db");
  const client = getDbClient();
  try {
    const migration = await readFile("drizzle/0127_provider_snapshots.sql", "utf8");
    await client.unsafe(migration.split("ALTER TABLE entry_creator_sources")[0].replaceAll("--> statement-breakpoint", ""));
    await client.unsafe(`
      create table creator_types(id integer primary key, code text not null);
      insert into creator_types values (1,'person'),(2,'collective'),(3,'organization');
      create table creators(id serial primary key, type_id integer not null references creator_types,
        name text not null, original_name text, slug text not null,
        updated_at timestamptz default now());
      create table creator_relations(source_creator_id integer references creators,target_creator_id integer references creators,
        relation_type text,primary key(source_creator_id,target_creator_id,relation_type));
      create table provider_creator_bindings(id serial primary key,creator_id integer references creators,
        provider text,external_creator_id text,active boolean default true);
      create unique index provider_creator_bindings_identity_unique on provider_creator_bindings(provider,external_creator_id) where active;
      create index provider_creator_bindings_creator_idx on provider_creator_bindings(creator_id);
      create table job_runs(id serial primary key,status text default 'running',lock_token text default 'live',
        lock_expires_at timestamptz default now()+interval '1 hour',created_at timestamptz default '2020-01-01',
        updated_at timestamptz default now(),payload jsonb default '{}');
      insert into creators(id,type_id,name,original_name,slug) select g,1,'Name '||g,'Original '||g,'creator-'||g from generate_series(1,20) g;
      insert into provider_creator_bindings(creator_id,provider,external_creator_id) select g,'fantlab',g::text from generate_series(1,20) g;
    `);
    await client.unsafe((await readFile("drizzle/0131_creator_life_dates.sql", "utf8")).replaceAll("--> statement-breakpoint", ""));
    const [preserved] = await client`select count(*)::int as count,count(birth_date)::int as births,count(death_date)::int as deaths from creators`;
    assert.deepEqual({ ...preserved }, { count: 20, births: 0, deaths: 0 }, "migration preserves existing creators and starts nullable");
    const core = await import("../src/db/queries/provider-snapshots");
    const creators = await import("../src/db/queries/creator-provider-snapshots");
    const { fantlabAuthorDescriptor } = await import("../src/lib/providers/creator-adapters");
    const { providerSnapshotJobHandler } = await import("../src/lib/providers/snapshot-job");
    const fixture = JSON.parse(await readFile("tests/fixtures/fantlab-authors/1.json", "utf8"));
    let timestamp = Date.now();
    const save = (id: number, overrides = {}) => core.saveProviderSnapshot({
      ...fantlabAuthorDescriptor(String(id)), payload: { ...fixture, autor_id: id, id, birthday: "1900-01-01", deathday: "1980-01-01", future: { nested: [true, null, 3] }, ...overrides },
      payloadHash: "", contentType: "application/json", requestStartedAt: new Date(++timestamp), fetchedAt: new Date(timestamp),
    });
    const apply = async (id: number, process = true, extra = {}) => {
      const state = (await creators.getCreatorSnapshotState(id))!;
      const snapshot = await core.getProviderSnapshot(fantlabAuthorDescriptor(String(id)));
      return creators.commitCreatorSnapshot({ creatorId: id, bindingId: state.bindings[0].id, externalId: String(id),
        ref: { id: snapshot!.id, payloadHash: snapshot!.payloadHash }, process, ...extra });
    };
    const dates = async (id: number) => {
      const state = (await creators.getCreatorSnapshotState(id))!;
      return { birthDate: state.birthDate, deathDate: state.deathDate };
    };
    const job = async (payload: SnapshotJobPayload) => {
      const [run] = await client`insert into job_runs(payload) values(${JSON.stringify(payload)}::jsonb) returning id`;
      return Number(run.id);
    };
    const execute = (runId: number, payload: SnapshotJobPayload, signal = new AbortController().signal) => providerSnapshotJobHandler.execute({
      runId, lockToken: "live", payload, signal, attempt: 1, jobId: null, source: "manual",
    });
    const resumePayload = async (id: number): Promise<SnapshotJobPayload> => (await client`select payload from job_runs where id=${id}`)[0].payload;

    await t.test("missing snapshot filter uses the complete descriptor, not dates or attached links", async () => {
      await save(1);
      await save(6);
      const base = { ...fantlabAuthorDescriptor("2"), payload: { ...fixture, autor_id: 2, id: 2 }, payloadHash: "", contentType: "application/json", requestStartedAt: new Date(++timestamp), fetchedAt: new Date(timestamp) };
      await core.saveProviderSnapshot({ ...base, apiMethod: "old-method" });
      await core.saveProviderSnapshot({ ...base, externalId: "3", providerCode: "other" });
      await core.saveProviderSnapshot({ ...base, externalId: "4", resourceType: "work" });
      await core.saveProviderSnapshot({ ...base, externalId: "5", requestParams: { biography: 1 } });
      await core.saveProviderSnapshot({ ...base, externalId: "700" });
      const input = { afterId: 0, throughId: 7, batchSize: 25, onlyMissingSnapshots: true };
      assert.deepEqual((await creators.creatorSnapshotBatchQuery(input)).map(row => row.id), [2, 3, 4, 5, 7]);
      assert.deepEqual((await creators.creatorSnapshotBatchQuery({ ...input, creatorIds: [1, 5, 6, 7] })).map(row => row.id), [5, 7]);
      assert.deepEqual((await creators.creatorSnapshotBatchQuery({ ...input, afterId: 4, throughId: 6 })).map(row => row.id), [5]);
      assert.deepEqual((await creators.creatorSnapshotBatchQuery({ ...input, onlyMissingSnapshots: false })).map(row => row.id), [1, 2, 3, 4, 5, 6, 7]);
      assert.deepEqual(await dates(1), { birthDate: null, deathDate: null }, "empty fields do not invalidate a saved snapshot");
      assert.deepEqual(await core.getEntitySnapshotHeaders({ entityType: "creator", entityId: "6" }), [], "an unattached raw still counts as saved");
      await client`update provider_creator_bindings set active=false where creator_id=7`;
      assert.deepEqual(await creators.creatorSnapshotBatchQuery({ ...input, creatorIds: [7] }), []);
      await client`update provider_creator_bindings set active=true where creator_id=7`;
      await client`delete from provider_snapshots`;
    });

    await t.test("full JSON roundtrip, refresh-only, NULL fill, idempotence and manual precedence", async () => {
      const saved = await save(1);
      assert.deepEqual((await core.getProviderSnapshot(fantlabAuthorDescriptor("1")))!.payload, saved.payload);
      assert.equal(typeof (saved.payload as Record<string, unknown>).biography, "string");
      assert.deepEqual((saved.payload as Record<string, unknown>).awards, fixture.awards);
      await apply(1, false);
      assert.deepEqual(await dates(1), { birthDate: null, deathDate: null });
      assert.equal((await core.getEntitySnapshotHeaders({ entityType: "creator", entityId: "1" })).length, 1);
      await client`update creators set birth_date='1890-01-01' where id=1`;
      await apply(1);
      assert.deepEqual(await dates(1), { birthDate: "1890-01-01", deathDate: "1980-01-01" });
      assert.deepEqual((await apply(1)).changes, {});
      await save(1, { birthday: "1880-01-01", deathday: "1990-01-01" });
      await apply(1);
      assert.deepEqual(await dates(1), { birthDate: "1890-01-01", deathDate: "1980-01-01" });
      await client`update creators set birth_date=null where id=1`;
      await apply(1);
      assert.deepEqual(await dates(1), { birthDate: "1880-01-01", deathDate: "1980-01-01" }, "manual clearing permits later enrichment");
      const [row] = await client`select name,original_name,slug from creators where id=1`;
      assert.deepEqual({ ...row }, { name: "Name 1", original_name: "Original 1", slug: "creator-1" });
      assert.equal((await core.getEntitySnapshotHeaders({ entityType: "creator", entityId: "1" })).length, 1);
    });

    await t.test("collectives, organizations and outgoing pseudonyms retain snapshots without dates or propagation", async () => {
      await client`update creators set type_id=2 where id=2`;
      await client`update creators set type_id=3 where id=3`;
      await client`insert into creator_relations values(4,5,'pseudonym_of')`;
      for (const id of [2, 3, 4]) {
        await save(id);
        const result = await apply(id);
        assert.deepEqual(await dates(id), { birthDate: null, deathDate: null });
        assert.ok(result.diagnostics.includes(id === 4 ? "pseudonym-skipped" : "non-person-skipped"));
        assert.equal((await core.getEntitySnapshotHeaders({ entityType: "creator", entityId: String(id) })).length, 1);
      }
      assert.deepEqual(await dates(5), { birthDate: null, deathDate: null });
      await save(5); await apply(5);
      assert.equal((await dates(5)).birthDate, "1900-01-01", "incoming pseudonym relation does not exclude canonical person");
    });

    await t.test("hash/source changes and lost leases leave dates, links and checkpoint untouched", async () => {
      const stale = await save(6);
      const state = (await creators.getCreatorSnapshotState(6))!;
      const runId = await job({ entityType: "creator", provider: "fantlab", operation: "process", creatorIds: [6] });
      const input = { creatorId: 6, bindingId: state.bindings[0].id, externalId: "6", process: true,
        ref: { id: stale.id, payloadHash: stale.payloadHash }, jobGuard: { runId, lockToken: "live" },
        checkpoint: { entityType: "creator" as const, provider: "fantlab" as const, operation: "process" as const, checkpoint: { afterId: 6, throughId: 6, processed: 1, failed: 0, errors: [] } } };
      await save(6, { birthday: "1901-01-01" });
      await assert.rejects(creators.commitCreatorSnapshot(input), /PROVIDER_SNAPSHOT_CHANGED/);
      await client`update provider_creator_bindings set external_creator_id='600' where creator_id=6`;
      await assert.rejects(creators.commitCreatorSnapshot(input), /PROVIDER_SOURCE_CHANGED/);
      await client`update provider_creator_bindings set external_creator_id='6' where creator_id=6`;
      await client`update job_runs set lock_expires_at=now()-interval '1 second' where id=${runId}`;
      await assert.rejects(creators.commitCreatorSnapshot(input), /STALE_SNAPSHOT_JOB/);
      assert.deepEqual(await dates(6), { birthDate: null, deathDate: null });
      assert.deepEqual(await core.getEntitySnapshotHeaders({ entityType: "creator", entityId: "6" }), []);
      assert.equal((await resumePayload(runId)).checkpoint, undefined);
    });

    await t.test("all three job operations use correct apply behavior; process has no network", async () => {
      for (const [id, operation] of [[7, "refresh"], [8, "process"], [9, "refresh-process"]] as const) {
        await save(id);
        const payload: SnapshotJobPayload = { entityType: "creator", provider: "fantlab", operation, creatorIds: [id] };
        const runId = await job(payload);
        await execute(runId, payload);
        assert.equal((await dates(id)).birthDate, operation === "refresh" ? null : "1900-01-01");
        assert.equal((await resumePayload(runId)).checkpoint?.processed, 1);
        assert.equal((await resumePayload(runId)).checkpoint?.afterId, id);
      }
      assert.equal(networkCalls, 0, "process is offline; refresh modes reuse evidence fetched after job creation");
    });

    await t.test("batch pause/resume preserves the fixed upper bound and reports missing/ambiguous bindings", async () => {
      for (const id of [10, 11, 12]) await save(id);
      const payload: SnapshotJobPayload = { entityType: "creator", provider: "fantlab", operation: "process", creatorIds: [10, 11, 12], batchSize: 1, batchPauseHours: 0.5 };
      const runId = await job(payload);
      await assert.rejects(execute(runId, payload), error => error instanceof Error && "code" in error && error.code === "provider-continue" && "deferSeconds" in error && error.deferSeconds === 1800);
      const first = await resumePayload(runId);
      assert.equal(first.checkpoint?.afterId, 10);
      assert.equal(first.checkpoint?.throughId, 20);
      await client`insert into creators(id,type_id,name,slug) values(21,1,'Late','late')`;
      await assert.rejects(execute(runId, first), error => error instanceof Error && "code" in error && error.code === "provider-continue");
      await execute(runId, await resumePayload(runId));
      const complete = (await resumePayload(runId)).checkpoint!;
      assert.equal(complete.processed, 3); assert.equal(complete.throughId, 20);
      await client`update provider_creator_bindings set active=false where creator_id=13`;
      await client`insert into provider_creator_bindings(creator_id,provider,external_creator_id) values(14,'fantlab','140')`;
      const badPayload: SnapshotJobPayload = { entityType: "creator", provider: "fantlab", operation: "process", creatorIds: [13, 14, 15] };
      const badId = await job(badPayload);
      await assert.rejects(execute(badId, badPayload), error => error instanceof Error && "code" in error && error.code === "snapshot-items-failed");
      const failed = (await resumePayload(badId)).checkpoint!;
      assert.equal(failed.failed, 3); assert.equal(failed.afterId, 15);
      assert.equal(failed.errors.length, 3);
    });

    await t.test("cancelled and expired jobs never advance the checkpoint", async () => {
      const payload: SnapshotJobPayload = { entityType: "creator", provider: "fantlab", operation: "process", creatorIds: [16] };
      const runId = await job(payload);
      const controller = new AbortController(); controller.abort();
      await assert.rejects(execute(runId, payload, controller.signal), error => error instanceof Error && error.name === "AbortError");
      assert.equal((await resumePayload(runId)).checkpoint?.processed, 0);
      await client`update job_runs set lock_token='new-owner' where id=${runId}`;
      await assert.rejects(execute(runId, payload), /STALE_SNAPSHOT_JOB/);
      assert.equal((await resumePayload(runId)).checkpoint?.processed, 0);
    });

    await t.test("manual update concurrent with processing wins under the Creator lock", async () => {
      await save(17);
      let release!: () => void;
      let locked!: () => void;
      const acquired = new Promise<void>(resolve => { locked = resolve; });
      const gate = new Promise<void>(resolve => { release = resolve; });
      const manual = client.begin(async tx => {
        await tx`select id from creators where id=17 for update`;
        locked(); await gate;
        await tx`update creators set birth_date='1895-06-07' where id=17`;
      });
      await acquired;
      const processing = apply(17);
      release(); await manual; await processing;
      assert.deepEqual(await dates(17), { birthDate: "1895-06-07", deathDate: "1980-01-01" });
      await Promise.all([apply(17), apply(17)]);
      assert.equal((await core.getEntitySnapshotHeaders({ entityType: "creator", entityId: "17" })).length, 1);
    });

    await t.test("transient processing failure checkpoints the same item and resumes after recovery", async () => {
      await save(18, { autor_id: 999, id: 999 });
      const payload: SnapshotJobPayload = { entityType: "creator", provider: "fantlab", operation: "process", creatorIds: [18] };
      const runId = await job(payload);
      await assert.rejects(execute(runId, payload), error => error instanceof Error && "code" in error && error.code === "provider-retry");
      const deferred = await resumePayload(runId);
      assert.equal(deferred.checkpoint?.afterId, 0);
      assert.equal(deferred.checkpoint?.retryId, 18);
      assert.equal(deferred.checkpoint?.retryCount, 1);
      assert.equal(deferred.checkpoint?.processed, 0);
      await save(18);
      await execute(runId, deferred);
      const complete = (await resumePayload(runId)).checkpoint!;
      assert.equal(complete.afterId, 18); assert.equal(complete.processed, 1);
      assert.equal(complete.retryId, undefined); assert.equal(complete.retryCount, undefined);
      assert.equal((await dates(18)).birthDate, "1900-01-01");
    });

    await t.test("missing-only job resumes a saved in-flight author without refetch and skips it in a new run", async () => {
      await core.saveProviderSnapshot({ ...fantlabAuthorDescriptor("19"), payload: { ...fixture, id: 19, autor_id: 19 }, payloadHash: "", contentType: "application/json",
        requestStartedAt: new Date("2010-01-01"), fetchedAt: new Date("2010-01-01") });
      const payload: SnapshotJobPayload = { entityType: "creator", provider: "fantlab", operation: "refresh-process", onlyMissingSnapshots: true, creatorIds: [19],
        checkpoint: { afterId: 0, throughId: 20, processed: 0, failed: 0, errors: [], retryId: 19 } };
      assert.deepEqual(await creators.creatorSnapshotBatchQuery({ afterId: 0, throughId: 20, batchSize: 25, onlyMissingSnapshots: true, creatorIds: [19] }), []);
      const runId = await job(payload);
      await execute(runId, payload);
      assert.equal((await resumePayload(runId)).checkpoint?.processed, 1);
      assert.equal((await resumePayload(runId)).checkpoint?.retryId, undefined);
      assert.equal((await core.getEntitySnapshotHeaders({ entityType: "creator", entityId: "19" })).length, 1);
      const repeat = { ...payload, checkpoint: undefined };
      const repeatId = await job(repeat);
      await execute(repeatId, repeat);
      assert.equal((await resumePayload(repeatId)).checkpoint?.processed, 0);
      assert.equal(networkCalls, 0, "a saved interrupted request never goes back to FantLab");
    });

    await t.test("ordinary FantLab approval creates the person, binding and enrichment job atomically without network", async () => {
      await client.unsafe(`
        alter table creators add column avatar_version integer default 0,add column created_at timestamptz default now();
        alter table creators add column avatar_object_key text,add column avatar_source text,add column avatar_source_external_id text,
          add column avatar_source_url text,add column avatar_original_url text,add column avatar_fetched_at timestamptz,add column avatar_content_hash text;
        alter table creator_types add column name text default 'Person',add column created_at timestamptz default now(),add column updated_at timestamptz default now();
        alter table provider_creator_bindings add column external_creator_name text,add column created_at timestamptz default now(),add column updated_at timestamptz default now();
        alter table job_runs alter column status set default 'queued';
        alter table job_runs add column job_id integer,add column retry_of_run_id integer,add column created_by_admin_id integer,
          add column type text,add column source text,add column scheduled_for timestamptz,add column available_at timestamptz,
          add column attempts integer default 0,add column max_attempts integer,add column timeout_seconds integer,
          add column retry_base_seconds integer,add column retry_max_seconds integer,add column locked_at timestamptz,
          add column locked_by text,add column started_at timestamptz,add column finished_at timestamptz,
          add column cancelled_at timestamptz,add column error_code text,add column error_message text;
        create table creator_requests(id serial primary key,provider text,media_type text,external_creator_id text,
          external_creator_name text,normalized_external_creator_name text,decision text,resolved_by_admin_id integer,
          resolved_at timestamptz,job_run_id integer,apply_status text default 'pending',job_error text,
          first_seen_at timestamptz default now(),last_seen_at timestamptz default now(),manually_reopened boolean default false,
          created_at timestamptz default now(),updated_at timestamptz default now());
        create table provider_creator_exclusions(id serial primary key,provider text,media_type text,external_creator_id text,
          external_creator_name text,normalized_external_creator_name text,created_at timestamptz default now(),updated_at timestamptz default now());
        create table admin_activity_logs(id serial primary key,created_at timestamptz default now(),actor_type text,admin_user_id integer,
          author_id integer,action text,entity_type text,entity_id integer,entity_label text,status text,severity text,message text,ip_address text,user_agent text,metadata jsonb);
        select setval(pg_get_serial_sequence('creators','id'),(select max(id) from creators));
      `);
      const requests = await import("../src/db/queries/creator-requests");
      const createRequest = async (externalId: string) => {
        const [request] = await client`insert into creator_requests(provider,media_type,external_creator_id,external_creator_name,normalized_external_creator_name)
          values('fantlab','book',${externalId},'New author','new author') returning id`;
        return Number(request.id);
      };
      const requestId = await createRequest("101");
      await requests.resolveCreatorRequest({ requestId, decision: "create", name: "New author", adminId: 1 });
      const [binding] = await client`select creator_id from provider_creator_bindings where provider='fantlab' and external_creator_id='101'`;
      assert.ok(binding);
      const [run] = await client`select payload,status from job_runs where type='provider.snapshots' and payload->'creatorIds' @> ${JSON.stringify([binding.creator_id])}::jsonb`;
      assert.deepEqual(run.payload, { entityType: "creator", creatorIds: [binding.creator_id], provider: "fantlab", operation: "refresh-process" });
      assert.equal(run.status, "queued");
      assert.deepEqual(await dates(binding.creator_id), { birthDate: null, deathDate: null });
      assert.equal(networkCalls, 0, "creating the person never waits for FantLab");
      const [before] = await client`select count(*)::int as n from creators`;
      const rollbackRequest = await createRequest("102");
      await client.unsafe("alter table job_runs add constraint reject_snapshot_test check(type <> 'provider.snapshots') not valid");
      await assert.rejects(requests.resolveCreatorRequest({ requestId: rollbackRequest, decision: "create", name: "Must rollback" }));
      assert.equal((await client`select count(*)::int as n from creators`)[0].n, before.n);
      assert.equal((await client`select count(*)::int as n from provider_creator_bindings where external_creator_id='102'`)[0].n, 0);
      assert.equal((await client`select decision from creator_requests where id=${rollbackRequest}`)[0].decision, null);
      await client.unsafe("alter table job_runs drop constraint reject_snapshot_test");
      const excludedId = await createRequest("103");
      const [jobsBefore] = await client`select count(*)::int as n from job_runs where type='provider.snapshots'`;
      await requests.resolveCreatorRequest({ requestId: excludedId, decision: "exclude" });
      assert.equal((await client`select count(*)::int as n from job_runs where type='provider.snapshots'`)[0].n, jobsBefore.n);
    });
    await t.test("missing snapshot query uses indexed identities at representative scale", async () => {
      const descriptor = fantlabAuthorDescriptor("1");
      const { snapshotHash } = await import("../src/lib/providers/snapshot-values");
      const requestKey = snapshotHash(descriptor.requestParams);
      await client.unsafe(`
        insert into creators(id,type_id,name,slug) select 100000+i,1,'Scale '||i,'scale-'||i from generate_series(1,100000)i;
        insert into provider_creator_bindings(creator_id,provider,external_creator_id) select 100000+i,'fantlab',(200000+i+j*100000)::text from generate_series(1,100000)i cross join generate_series(0,1)j;
        insert into provider_creator_bindings(creator_id,provider,external_creator_id) select 100000+i,'bgg',i::text from generate_series(1,100000)i;
      `);
      async function fillSnapshots(condition: string) {
        await client.unsafe(`insert into provider_snapshots(provider_code,resource_type,external_id,api_method,request_params,request_key,payload,content_type,payload_hash,request_started_at,fetched_at)
          select 'fantlab','author',b.external_creator_id,'autor.get','{"biography":1,"awards":1}'::jsonb,$1,
          jsonb_build_object('id',b.external_creator_id::int,'autor_id',b.external_creator_id::int,'type','autor','is_opened',1,'name','Scale','biography','','awards','{}'::jsonb),
          'application/json',repeat('a',64),now(),now() from provider_creator_bindings b
          where b.provider='fantlab' and b.creator_id>100000 and (${condition}) on conflict do nothing`, [requestKey]);
        await client.unsafe("analyze creators; analyze provider_creator_bindings; analyze provider_snapshots");
      }
      await fillSnapshots("b.creator_id % 2 = 0");
      const input = { afterId: 100000, throughId: 200000, batchSize: 25 };
      const scenarios: [string, number, boolean, number | undefined][] = [
        ["baseline", 26, false, undefined], ["common-missing", 26, true, undefined],
        ["rare-missing", 10, true, undefined], ["absent", 0, true, undefined], ["in-flight", 1, true, 100001],
      ];
      for (const [name, expected, onlyMissingSnapshots, retryId] of scenarios) {
        if (name === "rare-missing") await fillSnapshots("b.creator_id <= 199980");
        if (name === "absent") await fillSnapshots("true");
        const query = creators.creatorSnapshotBatchQuery({ ...input, onlyMissingSnapshots, retryId }).toSQL();
        const [explained] = await client.unsafe(`explain(analyze,buffers,format json) ${query.sql}`, query.params as never[]);
        const plan = explained["QUERY PLAN"][0];
        assert.equal(plan.Plan["Actual Rows"], expected, name);
        const nodes: { type: string; index?: string; rows: number; loops: number }[] = [];
        const visit = (node: Record<string, unknown>) => {
          nodes.push({ type: String(node["Node Type"]), index: node["Index Name"] as string | undefined, rows: Number(node["Actual Rows"]), loops: Number(node["Actual Loops"]) });
          for (const child of (node.Plans ?? []) as Record<string, unknown>[]) visit(child);
        };
        visit(plan.Plan);
        t.diagnostic(JSON.stringify({ name, creators: 100000, bindings: 300000, snapshots: name === "common-missing" || name === "baseline" ? 100000 : 200000, executionMs: plan["Execution Time"], sharedHitBlocks: plan.Plan["Shared Hit Blocks"], nodes }));
        assert.ok(nodes.some(node => node.index === "provider_creator_bindings_active_creator_idx"), "binding range is indexed");
        if (onlyMissingSnapshots) assert.ok(nodes.some(node => node.index === "provider_snapshots_identity_unique" || node.type.includes("Join") || (node.type === "Seq Scan" && node.loops === 1)), "snapshot lookup uses the identity index or a single pass for the anti/hash join");
        assert.ok(nodes.every(node => node.type !== "Seq Scan" || node.loops <= 1), "no correlated full-table rescans");
      }
    });
  } finally {
    await client.end();
    await admin.unsafe(`drop schema ${schema} cascade`);
    await admin.end();
    process.env.DATABASE_URL = originalUrl;
    global.fetch = originalFetch;
  }
});
