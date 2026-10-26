import assert from "node:assert/strict";
import { appendFileSync, readFileSync } from "node:fs";
import { test } from "node:test";

const testUrl = process.env.ANILIST_CREATORS_TEST_DATABASE_URL;

test("AniList snapshot batches and exact MAL lookup use indexed evidence at 100k", { skip: !testUrl, timeout: 180000 }, async t => {
  const schema = `anilist_snapshots_plan_${process.pid}_${Date.now()}`;
  const url = new URL(testUrl!);
  url.searchParams.set("options", `-c search_path=${schema}`);
  process.env.DATABASE_URL = url.toString();
  const { getDbClient } = await import("../src/db");
  const { providerSnapshotAnimeBatchQuery } = await import("../src/db/queries/provider-snapshot-jobs");
  const { savedAniListCreatorSnapshotQuery } = await import("../src/lib/providers/anilist-creators-service");
  const { snapshotHash } = await import("../src/lib/providers/snapshot-values");
  const client = getDbClient();
  const artifact = `/tmp/${schema}.jsonl`;
  const nodes = (plan: Record<string, unknown>): Record<string, unknown>[] => [plan, ...((plan.Plans as Record<string, unknown>[] | undefined) ?? []).flatMap(nodes)];
  try {
    await client.unsafe(`create schema ${schema}; set statement_timeout='60s';
      create unlogged table media_items(id integer primary key,media_type text);
      insert into media_items select g,'anime' from generate_series(1,100000)g;
      create unlogged table media_item_metadata(media_item_id integer primary key,source_provider text,source_external_id text);
      insert into media_item_metadata select g,case when g%2=1 then 'anilist' else 'jikan' end,case when g%2=1 then g::text else (g+100000)::text end from generate_series(1,100000)g;
      create unlogged table provider_snapshots(id integer primary key,provider_code text,resource_type text,external_id text,api_method text,request_params jsonb,request_key text,payload jsonb,content_type text,payload_hash text,request_started_at timestamptz,fetched_at timestamptz);
      create unique index provider_snapshots_identity_unique on provider_snapshots(provider_code,resource_type,external_id,api_method,request_key);
      insert into provider_snapshots select g,'anilist','anime',g::text,'anime.creators','{"version":1}', '${snapshotHash({ version: 1 })}', jsonb_build_object('mediaId',g,'idMal',g+100000,'complete',true,'staff','[]'::jsonb,'studios','[]'::jsonb),'application/json','hash',now(),now() from generate_series(1,100000)g;
      analyze;`);
    t.diagnostic(`Full SQL and execution plans: ${artifact}`);
    const explain = async (name: string, query: { sql: string; params: unknown[] }) => {
      const [row] = await client.unsafe(`explain(analyze,buffers,format json) ${query.sql}`, query.params as never[]);
      const result = row["QUERY PLAN"][0];
      appendFileSync(artifact, JSON.stringify({ name, anime: 100000, snapshots: 100000, sql: query.sql, params: query.params, result }) + "\n");
      t.diagnostic(JSON.stringify({ name, ms: result["Execution Time"], rows: result.Plan["Actual Rows"], buffers: result.Plan["Shared Hit Blocks"] + result.Plan["Shared Read Blocks"], scans: nodes(result.Plan).filter(n => n["Relation Name"] === "provider_snapshots").map(n => ({ type: n["Node Type"], index: n["Index Name"], loops: n["Actual Loops"], rows: n["Actual Rows"], removed: n["Rows Removed by Filter"] })) }));
      return result;
    };
    for (const externalId of ["100042", "999999"]) await explain(`mal-before:${externalId}`, savedAniListCreatorSnapshotQuery("jikan", externalId).toSQL());
    await client.unsafe(readFileSync("drizzle/0145_anilist_snapshot_mal_index.sql", "utf8"));
    await client.unsafe("analyze provider_snapshots");
    for (const externalId of ["100042", "999999"]) {
      const plan = await explain(`mal-after:${externalId}`, savedAniListCreatorSnapshotQuery("jikan", externalId).toSQL());
      assert.ok(nodes(plan.Plan).some(n => n["Index Name"] === "provider_snapshots_anilist_mal_idx"));
    }
    await explain("anilist-exact", savedAniListCreatorSnapshotQuery("anilist", "42").toSQL());
    for (const state of ["absent-missing", "rare-missing", "common-missing"]) {
      if (state === "rare-missing") await client.unsafe("delete from provider_snapshots where id in(50999,51000); analyze provider_snapshots");
      if (state === "common-missing") await client.unsafe("delete from provider_snapshots where id>50000; analyze provider_snapshots");
      const plan = await explain(`batch:${state}`, providerSnapshotAnimeBatchQuery({ afterId: 50000, throughId: 51000, onlyMissingSnapshots: true, batchSize: 25 }).toSQL());
      assert.equal(plan.Plan["Actual Rows"], state === "absent-missing" ? 0 : state === "rare-missing" ? 2 : 26);
      if (state !== "common-missing") {
        const full = await explain(`batch-full-range:${state}`, providerSnapshotAnimeBatchQuery({ afterId: 0, throughId: 100000, onlyMissingSnapshots: true }).toSQL());
        assert.equal(full.Plan["Actual Rows"], state === "absent-missing" ? 0 : 2);
      }
      assert.ok(!nodes(plan.Plan).some(n => n["Relation Name"] === "provider_snapshots" && n["Node Type"] === "Seq Scan" && Number(n["Actual Loops"]) > 1), "per-record full scans of snapshots must not occur");
    }
    const selected = await explain("batch-selected-retry", providerSnapshotAnimeBatchQuery({ afterId: 0, throughId: 100000, mediaItemIds: [41, 42], onlyMissingSnapshots: true, retryId: 42 }).toSQL());
    assert.equal(selected.Plan["Actual Rows"], 1);
  } finally {
    await client.unsafe(`drop schema ${schema} cascade`);
    await client.end();
  }
});
