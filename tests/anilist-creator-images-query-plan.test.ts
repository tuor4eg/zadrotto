import assert from "node:assert/strict";
import { appendFileSync } from "node:fs";
import { test } from "node:test";

const testUrl = process.env.ANILIST_CREATORS_TEST_DATABASE_URL;

test("AniList portrait raw reuse and binding batches use indexed profiles at 100k", { skip: !testUrl, timeout: 180000 }, async t => {
  const schema = `anilist_images_plan_${process.pid}_${Date.now()}`;
  const url = new URL(testUrl!);
  url.searchParams.set("options", `-c search_path=${schema}`);
  process.env.DATABASE_URL = url.toString();
  const { getDbClient, db } = await import("../src/db");
  const { creatorProfileBindingBatchQuery } = await import("../src/db/queries/creator-profile-snapshots");
  const { creatorImageBindingsQuery } = await import("../src/db/queries/creator-image-commit");
  const { getTableColumns } = await import("drizzle-orm");
  const { creators, jobRuns } = await import("../src/db/schema");
  const { creatorImagesScopeQuery, creatorImagesBatchQuery } = await import("../src/db/queries/creator-images");
  const { animeCompanyLogoCreatorQuery, animeCompanyLogoBindingsQuery, animeCompanyLogoSourceAllowed } = await import("../src/db/queries/anime-company-logo-binding");
  const { enqueueCreatorImageFills, enqueueCreatorImageFill } = await import("../src/db/queries/creator-image-jobs");
  const { aniListCreatorsMissingImagesQuery } = await import("../src/db/queries/anilist-creators");
  const { snapshotHash } = await import("../src/lib/providers/snapshot-values");
  const client = getDbClient();
  const artifact = `/tmp/${schema}.jsonl`;
  const nodes = (plan: Record<string, unknown>): Record<string, unknown>[] => [plan, ...((plan.Plans as Record<string, unknown>[] | undefined) ?? []).flatMap(nodes)];
  try {
    await client.unsafe(`create schema ${schema};
      create unlogged table provider_creator_bindings(id integer primary key,creator_id integer,provider text,external_creator_id text,external_creator_name text,active boolean,created_at timestamptz default now(),updated_at timestamptz default now());
      insert into provider_creator_bindings(id,creator_id,provider,external_creator_id,external_creator_name,active) select g,g,'anilist','person:'||g,'Person '||g,true from generate_series(1,100000)g;
      create index provider_creator_bindings_creator_idx on provider_creator_bindings(creator_id);
      create unique index provider_creator_bindings_identity_unique on provider_creator_bindings(provider,external_creator_id) where active;
      create unlogged table provider_snapshots(id integer primary key,provider_code text,resource_type text,external_id text,api_method text,request_key text);
      insert into provider_snapshots select g,'anilist','person',g::text,'staff.image','${snapshotHash({ version: 1 })}' from generate_series(1,100000)g;
      create unique index provider_snapshots_identity_unique on provider_snapshots(provider_code,resource_type,external_id,api_method,request_key);
      create unlogged table provider_snapshot_links(snapshot_id integer,entity_type text,entity_id text,purpose text,primary key(snapshot_id,entity_type,entity_id,purpose));
      insert into provider_snapshot_links select g,'creator',g::text,'primary' from generate_series(1,100000)g;
      create index provider_snapshot_links_entity_idx on provider_snapshot_links(entity_type,entity_id,purpose,snapshot_id);
      analyze;`);
    const creatorColumns = Object.values(getTableColumns(creators)).map(column => `"${column.name}" ${column.getSQLType()}${column.name === "id" ? " primary key" : ""}`).join(",");
    await client.unsafe(`create unlogged table creators(${creatorColumns}); create unlogged table creator_types(id integer primary key,code text); insert into creator_types values(1,'person'),(2,'organization'); insert into creators(id,name,original_name,slug,type_id) select g,'Creator '||g,'Original '||g,'creator-'||g,case when g%2=1 then 1 else 2 end from generate_series(1,100000)g; analyze creators; analyze creator_types;`);
    t.diagnostic(`Full SQL and execution plans: ${artifact}`);
    const explain = async (name: string, query: { sql: string; params: unknown[] }) => {
      const [row] = await client.unsafe(`explain(analyze,buffers,format json) ${query.sql}`, query.params as never[]);
      const result = row["QUERY PLAN"][0];
      appendFileSync(artifact, JSON.stringify({ name, profiles: 100000, sql: query.sql, params: query.params, result }) + "\n");
      t.diagnostic(JSON.stringify({ name, ms: result["Execution Time"], rows: result.Plan["Actual Rows"], buffers: result.Plan["Shared Hit Blocks"] + result.Plan["Shared Read Blocks"], indexes: [...new Set(nodes(result.Plan).flatMap(n => n["Index Name"] ? [n["Index Name"]] : []))] }));
      return result;
    };
    for (const creatorId of [42, 100001]) {
      const plan = await explain(`image-bindings:${creatorId}`, creatorImageBindingsQuery(creatorId).toSQL());
      assert.ok(nodes(plan.Plan).some(n => n["Index Name"] === "provider_creator_bindings_creator_idx"));
    }
    for (const state of ["none-missing", "rare-missing", "common-missing"]) {
      if (state === "rare-missing") await client.unsafe("delete from provider_snapshot_links where snapshot_id in(99999,100000); analyze provider_snapshot_links");
      if (state === "common-missing") await client.unsafe("delete from provider_snapshot_links where snapshot_id>50000; analyze provider_snapshot_links");
      const plan = await explain(`profile-batch:${state}`, creatorProfileBindingBatchQuery({ provider: "anilist", afterId: 50000, throughId: 100000, batchSize: 25, onlyMissingSnapshots: true }).toSQL());
      assert.equal(plan.Plan["Actual Rows"], state === "none-missing" ? 0 : state === "rare-missing" ? 2 : 26);
      assert.ok(!nodes(plan.Plan).some(n => ["provider_snapshots", "provider_snapshot_links"].includes(String(n["Relation Name"])) && n["Node Type"] === "Seq Scan" && Number(n["Actual Loops"]) > 1));
    }
    await client.unsafe("update provider_creator_bindings set external_creator_id='studio:'||creator_id where creator_id%2=0; analyze provider_creator_bindings");
    for (const creatorTypeId of [1, 2]) {
      const scopeQuery = creatorImagesScopeQuery({ batchSize: 25, creatorTypeId });
      const scope = await scopeQuery;
      assert.equal(scope[0].total, 50000);
      await explain(`image-scope:type-${creatorTypeId}`, scopeQuery.toSQL());
      const batch = await explain(`image-batch:type-${creatorTypeId}`, creatorImagesBatchQuery({ batchSize: 25, creatorTypeId, afterId: 50000, throughId: 100000 }).toSQL());
      assert.equal(batch.Plan["Actual Rows"], 26);
    }
    await client.unsafe(`create unlogged table creator_requests(id integer primary key,provider text,external_creator_id text,decision text,manually_reopened boolean);
      insert into creator_requests select g,'anilist','studio:'||g,case when g%97=0 then 'exclude' end,g%101=0 from generate_series(1,100000)g;
      create unique index creator_requests_identity_idx on creator_requests(provider,external_creator_id) where external_creator_id is not null;
      create unlogged table provider_creator_exclusions(id integer primary key,provider text,external_creator_id text,media_type text,normalized_external_creator_name text);
      insert into provider_creator_exclusions select g,'anilist',case when g%2=0 then 'studio:'||g end,'anime','studio '||g from generate_series(1,100000)g;
      create unique index provider_creator_exclusions_identity_idx on provider_creator_exclusions(provider,external_creator_id) where external_creator_id is not null;
      create unique index provider_creator_exclusions_name_idx on provider_creator_exclusions(provider,media_type,normalized_external_creator_name) where external_creator_id is null;
      analyze creator_requests; analyze provider_creator_exclusions;`);
    for (const id of [42, 100001]) {
      const recorded: { sql: string; params: unknown[] }[] = [];
      client.options.debug = (_connection, statement, params) => { if (statement.trim().startsWith("select")) recorded.push({ sql: statement, params: [...params] }); };
      try { await animeCompanyLogoSourceAllowed({ externalCreatorId: `studio:${id}`, externalCreatorName: `Studio ${id}` }, `Studio ${id}`); }
      finally { client.options.debug = false; }
      for (const [index, query] of recorded.entries()) {
        const source = await explain(`logo-source-permission:${id}:${index}`, query);
        assert.ok(!nodes(source.Plan).some(n => ["creator_requests", "provider_creator_exclusions"].includes(String(n["Relation Name"])) && n["Node Type"] === "Seq Scan"));
      }
      const creator = await explain(`logo-creator:${id}`, animeCompanyLogoCreatorQuery(id).toSQL());
      assert.ok(nodes(creator.Plan).some(n => n["Index Name"] === "creators_pkey"));
      const bindings = await explain(`logo-bindings:${id}`, animeCompanyLogoBindingsQuery(id).toSQL());
      assert.ok(nodes(bindings.Plan).some(n => n["Index Name"] === "provider_creator_bindings_creator_idx"));
    }
    const jobColumns = Object.values(getTableColumns(jobRuns)).map(column => `"${column.name}" ${column.getSQLType()}${column.name === "id" ? " primary key" : ""}`).join(",");
    await client.unsafe(`create unlogged table job_runs(${jobColumns}); alter table job_runs alter column status set default 'queued';
      insert into job_runs(id,type,status,payload) select g,'media.creator-image-fill','queued',jsonb_build_object('creatorId',g,'bindingFingerprint','previous') from generate_series(1,100000)g;
      select setval(pg_get_serial_sequence('job_runs','id'),100000);
      create unique index job_runs_creator_image_fill_active_unique on job_runs((payload->>'creatorId'),(payload->>'bindingFingerprint')) where type='media.creator-image-fill' and status in('queued','running');
      create unlogged table entry_creator_sources(entry_id integer,creator_id integer,role_id integer,provider text,normalized_external_creator_name text,primary key(entry_id,creator_id,role_id,provider,normalized_external_creator_name));
      insert into entry_creator_sources select g,p,1,'anilist','person:'||p from generate_series(1,100000)g cross join generate_series(1,10)p;
      analyze job_runs; analyze entry_creator_sources;`);
    for (const count of [4, 40]) {
      const recorded: { sql: string; params: unknown[] }[] = [];
      const ids = Array.from({length: count}, (_, index) => 2000 + count * 10 + index);
      client.options.debug = (_connection, statement, params) => { if (/^(select|insert)/.test(statement.trim())) recorded.push({sql:statement,params:[...params]}); };
      let added;
      try { added = await db.transaction(tx => enqueueCreatorImageFills(tx, [...ids].reverse().concat(ids[0]))); }
      finally { client.options.debug = false; }
      assert.equal(added.length, count);
      assert.equal(recorded.filter(q => q.sql.startsWith("select")).length, 3, "enqueue reads must be constant per roster, independent of participant count");
      for (const [index, query] of recorded.filter(q => q.sql.startsWith("select")).entries()) await explain(`batch-enqueue:${count}:${index}`, query);
      assert.equal((await db.transaction(tx => enqueueCreatorImageFills(tx, ids))).length, 0, "same fingerprint is already queued");
      await db.transaction(tx => enqueueCreatorImageFill(tx, ids[0]));
      const [active] = await client.unsafe("select count(*)::int n from job_runs where payload->>'creatorId'=$1 and payload->>'bindingFingerprint'<>'previous' and status='queued'", [String(ids[0])]);
      assert.equal(active.n, 1, "single and batched enqueue share the same deduplication identity");
    }
    await Promise.all([
      db.transaction(tx => enqueueCreatorImageFills(tx, [5002, 5001])),
      db.transaction(tx => enqueueCreatorImageFills(tx, [5001, 5002])),
      db.transaction(tx => enqueueCreatorImageFill(tx, 5001)),
    ]);
    const [concurrent] = await client.unsafe("select count(*)::int n from job_runs where payload->>'creatorId' in ('5001','5002') and payload->>'bindingFingerprint'<>'previous' and status='queued'");
    assert.equal(concurrent.n, 2, "concurrent single and differently ordered roster batches queue one job per identity");
    for (const id of [42, 100001]) {
      const missing = await explain(`roster-missing-images:${id}`, aniListCreatorsMissingImagesQuery(id).toSQL());
      assert.equal(missing.Plan["Actual Rows"], id === 42 ? 10 : 0);
      assert.ok(nodes(missing.Plan).some(n => n["Index Name"] === "entry_creator_sources_pkey"));
    }
  } finally {
    client.options.debug = false;
    await client.unsafe(`drop schema ${schema} cascade`);
    await client.end();
  }
});
