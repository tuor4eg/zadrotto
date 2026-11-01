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
  const { providerSnapshotAnimeBatchQuery, providerSnapshotAniListMetadataBatchQuery } = await import("../src/db/queries/provider-snapshot-jobs");
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
    // Reuse the same scale fixture for the new exact-primary-link access path.
    await client.unsafe(`create unlogged table provider_snapshot_links(snapshot_id integer,entity_type text,entity_id text,purpose text,primary key(snapshot_id,entity_type,entity_id,purpose));
      create index provider_snapshot_links_entity_idx on provider_snapshot_links(entity_type,entity_id,purpose,snapshot_id);
      insert into provider_snapshots select g+100000,'anilist','anime',g::text,'anime.details','{"version":1}', '${snapshotHash({ version: 1 })}', '{}','application/json','hash',now(),now() from generate_series(1,100000)g;
      insert into provider_snapshot_links select g+100000,'media-item',g::text,'primary' from generate_series(1,100000)g;
      analyze;`);
    for (const state of ["no-missing", "rare-missing", "common-missing"]) {
      if (state === "rare-missing") await client.unsafe("delete from provider_snapshot_links where entity_id='50999'; analyze provider_snapshot_links");
      if (state === "common-missing") await client.unsafe("delete from provider_snapshot_links where snapshot_id>150000; analyze provider_snapshot_links");
      const plan = await explain(`primary-batch:${state}`, providerSnapshotAniListMetadataBatchQuery({ afterId: 50000, throughId: 51000, onlyMissingSnapshots: true, batchSize: 25 }).toSQL());
      assert.equal(plan.Plan["Actual Rows"], state === "no-missing" ? 0 : state === "rare-missing" ? 1 : 26);
      assert.ok(!nodes(plan.Plan).some(n => ["provider_snapshots", "provider_snapshot_links"].includes(String(n["Relation Name"])) && n["Node Type"] === "Seq Scan" && Number(n["Actual Loops"]) > 1), "primary selection must not repeatedly scan raw snapshots or entity links");
      if (state === "no-missing") await explain("primary-batch-full-range:no-missing", providerSnapshotAniListMetadataBatchQuery({ afterId: 0, throughId: 100000, onlyMissingSnapshots: true }).toSQL());
    }
    await client.unsafe(`alter table media_items add publication_status text default 'published', add media_carrier_id integer,
      add title text default 'Anime', add original_title text, add release_year integer, add metadata_attempted_at timestamptz;
      alter table media_item_metadata add facts jsonb default '{"episodeCount":12}', add fetched_at timestamptz default now();
      create unlogged table media_carriers(id integer primary key,code text);
      create index media_items_metadata_attempted_at_idx on media_items(metadata_attempted_at); analyze;`);
    const { getMediaItemsMissingMetadataQuery } = await import("../src/db/queries/media-item-metadata");
    const backfill = await explain("metadata-backfill:primary-missing", getMediaItemsMissingMetadataQuery({ mediaType: "anime", limit: 25 }).toSQL());
    assert.equal(backfill.Plan["Actual Rows"], 25);
    assert.ok(!nodes(backfill.Plan).some(n => ["provider_snapshots", "provider_snapshot_links"].includes(String(n["Relation Name"])) && n["Node Type"] === "Seq Scan" && Number(n["Actual Loops"]) > 1), "general backfill must not repeatedly scan evidence tables");
  } finally {
    await client.unsafe(`drop schema ${schema} cascade`);
    await client.end();
  }
});
