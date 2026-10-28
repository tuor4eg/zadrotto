import assert from "node:assert/strict";
import { appendFileSync } from "node:fs";
import test from "node:test";
import { asc, eq, gt, sql } from "drizzle-orm";

const testUrl = process.env.GAME_SNAPSHOTS_TEST_DATABASE_URL;
test("game snapshot batches use exact indexed requests at 100k for IGDB and RAWG", { skip: !testUrl, timeout: 180000 }, async t => {
  const schema = `game_snapshot_plan_${process.pid}_${Date.now()}`;
  const url = new URL(testUrl!); url.searchParams.set("options", `-c search_path=${schema}`);
  process.env.DATABASE_URL = url.toString();
  const { getDbClient } = await import("../src/db");
  const { providerSnapshotGameBatchQuery } = await import("../src/db/queries/provider-snapshot-jobs");
  const { describeGameSource } = await import("../src/lib/providers/game-adapter");
  const { snapshotHash } = await import("../src/lib/providers/snapshot-values");
  const client = getDbClient();
  const artifact = `/tmp/${schema}.jsonl`;
  const nodes = (plan: Record<string, unknown>): Record<string, unknown>[] => [plan, ...((plan.Plans as Record<string, unknown>[] | undefined) ?? []).flatMap(nodes)];
  try {
    await client.unsafe(`create schema ${schema}; set statement_timeout='60s';
      create unlogged table media_items(id integer primary key,media_type text);
      insert into media_items select g,'game' from generate_series(1,100000)g;
      create unlogged table media_item_metadata(media_item_id integer primary key,source_provider text,source_external_id text);
      insert into media_item_metadata select g,case when g%2=1 then 'igdb' else 'rawg' end,g::text from generate_series(1,100000)g;
      create unlogged table provider_snapshots(id integer primary key,provider_code text,resource_type text,external_id text,api_method text,request_params jsonb,request_key text);
      create unique index provider_snapshots_identity_unique on provider_snapshots(provider_code,resource_type,external_id,api_method,request_key);`);
    for (const [provider, parity] of [["igdb", 1], ["rawg", 0]] as const) {
      const descriptor = describeGameSource(provider, "1");
      await client`insert into provider_snapshots select g,${provider},'game',g::text,${descriptor.apiMethod},${client.json(descriptor.requestParams)}::jsonb,${snapshotHash(descriptor.requestParams)} from generate_series(1,100000)g where g%2=${parity}`;
    }
    await client.unsafe("analyze media_items; analyze media_item_metadata; analyze provider_snapshots");
    const explain = async (name: string, input: Parameters<typeof providerSnapshotGameBatchQuery>[0]) => {
      const query = providerSnapshotGameBatchQuery(input).toSQL();
      const [row] = await client.unsafe(`explain(analyze,buffers,format json) ${query.sql}`, query.params as never[]);
      const result = row["QUERY PLAN"][0];
      appendFileSync(artifact, JSON.stringify({ name, ...query, result }) + "\n");
      t.diagnostic(JSON.stringify({ name, ms: result["Execution Time"], rows: result.Plan["Actual Rows"], buffers: result.Plan["Shared Hit Blocks"] + result.Plan["Shared Read Blocks"] }));
      assert.ok(!nodes(result.Plan).some(n => n["Relation Name"] === "provider_snapshots" && n["Node Type"] === "Seq Scan" && Number(n["Actual Loops"]) > 1), "snapshot scans must never multiply per game");
      return result;
    };
    for (const state of ["absent-missing", "rare-missing", "common-missing"]) {
      if (state === "rare-missing") await client.unsafe("delete from provider_snapshots where id in(50999,51000); analyze provider_snapshots");
      if (state === "common-missing") await client.unsafe("delete from provider_snapshots where id>50000; analyze provider_snapshots");
      for (const provider of [undefined, "igdb", "rawg"] as const) {
        const plan = await explain(`${state}:${provider ?? "both"}`, { provider, afterId: 50000, throughId: 51000, onlyMissingSnapshots: true });
        assert.equal(plan.Plan["Actual Rows"], state === "absent-missing" ? 0 : state === "rare-missing" ? provider ? 1 : 2 : 26);
      }
      if (state !== "common-missing") {
        const full = await explain(`${state}:full-range`, { afterId: 0, throughId: 100000, onlyMissingSnapshots: true });
        assert.equal(full.Plan["Actual Rows"], state === "absent-missing" ? 0 : 2);
      }
    }
    const retry = await explain("selected-retry", { afterId: 0, throughId: 100000, mediaItemIds: [41, 42], retryId: 42, onlyMissingSnapshots: true });
    assert.equal(retry.Plan["Actual Rows"], 1);
    const normal = await explain("normal-keyset-page", { afterId: 50000, throughId: 100000, batchSize: 25 });
    assert.equal(normal.Plan["Actual Rows"], 26);
    // Compatibility reads use working relationships, with realistic fan-out per game.
    for (const table of ["creators", "creator_roles", "entry_creators", "entry_creator_sources", "genres", "media_item_genres", "platforms", "media_item_platforms", "provider_creator_bindings", "provider_creator_exclusions", "creator_requests", "creator_request_media_items"]) {
      await client.unsafe(`create unlogged table ${table} (like public.${table} including all)`);
    }
    await client.unsafe(`alter table media_item_metadata add column facts jsonb;
      update media_item_metadata set facts='{"gameSnapshotProcessed":true,"kept":42}'::jsonb;
      insert into creator_roles select * from public.creator_roles;
      insert into creators(id,name,slug,type_id) select g,'Studio '||g,'studio-'||g,1 from generate_series(1,1000)g;
      insert into entry_creators(entry_id,creator_id,role_id)
        select g,((g+p)%1000)+1,(select id from creator_roles where code=case when p=0 then 'developer' else 'publisher' end)
        from generate_series(1,100000)g cross join generate_series(0,1)p;
      insert into entry_creator_sources(entry_id,creator_id,role_id,provider,normalized_external_creator_name,source_position)
        select ec.entry_id,ec.creator_id,ec.role_id,m.source_provider,'studio '||ec.creator_id,0 from entry_creators ec join media_item_metadata m on m.media_item_id=ec.entry_id;
      insert into genres(id,name,slug) select g,'Genre '||g,'genre-'||g from generate_series(1,10)g;
      insert into platforms(id,name,slug) select g,'Platform '||g,'platform-'||g from generate_series(1,10)g;
      insert into media_item_genres(media_item_id,genre_id,provider) select g,((g+p)%10)+1,'igdb' from generate_series(1,100000)g cross join generate_series(0,2)p;
      insert into media_item_platforms(media_item_id,platform_id,provider) select g,((g+p)%10)+1,'igdb' from generate_series(1,100000)g cross join generate_series(0,1)p;
      analyze media_item_metadata; analyze creators; analyze creator_roles; analyze entry_creators; analyze entry_creator_sources; analyze genres; analyze media_item_genres; analyze platforms; analyze media_item_platforms;
    `);
    const { db } = await import("../src/db");
    const { mediaItems, mediaItemMetadata } = await import("../src/db/schema");
    const { mediaMetadataFactsSql } = await import("../src/db/queries/book-metadata");
    for (const afterId of [0, 50000]) {
      const query = db.select({ id: mediaItems.id, facts: mediaMetadataFactsSql({ mediaType: sql`'game'` }) }).from(mediaItems)
        .innerJoin(mediaItemMetadata, eq(mediaItems.id, mediaItemMetadata.mediaItemId)).where(gt(mediaItems.id, afterId)).orderBy(asc(mediaItems.id)).limit(25).toSQL();
      const [row] = await client.unsafe(`explain(analyze,buffers,format json) ${query.sql}`, query.params as never[]);
      const result = row["QUERY PLAN"][0];
      appendFileSync(artifact, JSON.stringify({ name: `working-facts-page:${afterId}`, ...query, result }) + "\n");
      assert.equal(result.Plan["Actual Rows"], 25);
      assert.ok(!nodes(result.Plan).some(n => n["Relation Name"] === "provider_snapshots"));
      assert.ok(!nodes(result.Plan).some(n => ["entry_creators", "entry_creator_sources", "media_item_genres", "media_item_platforms"].includes(String(n["Relation Name"])) && n["Node Type"] === "Seq Scan" && Number(n["Actual Loops"]) > 1));
      t.diagnostic(JSON.stringify({ name: `working-facts-page:${afterId}`, ms: result["Execution Time"], buffers: result.Plan["Shared Hit Blocks"] + result.Plan["Shared Read Blocks"] }));
    }
    const { describeBggSource } = await import("../src/lib/providers/bgg-adapter");
    const { providerSnapshotBoardgameBatchQuery } = await import("../src/db/queries/provider-snapshot-jobs");
    const bgg = describeBggSource("1");
    await client.unsafe(`update media_items set media_type='boardgame';
      update media_item_metadata set source_provider='bgg',facts='{"bggSnapshotProcessed":true}'::jsonb;
      update entry_creators set role_id=(select id from creator_roles where code=case when creator_id%2=0 then 'designer' else 'artist' end);
      insert into creator_requests(id,provider,media_type,external_creator_id,external_creator_name,normalized_external_creator_name)
        select g,'bgg','boardgame',g::text,'Pending designer '||g,'pending designer '||g from generate_series(1,10000)g;
      insert into creator_request_media_items(request_id,media_item_id,role_id,external_creator_name)
        select g,g+p,(select id from creator_roles where code='designer'),'Pending designer '||g from generate_series(1,10000)g cross join generate_series(0,1)p;
      delete from provider_snapshots;
    `);
    await client`insert into provider_snapshots select g,'bgg',${bgg.resourceType},g::text,${bgg.apiMethod},${JSON.stringify(bgg.requestParams)}::jsonb,${snapshotHash(bgg.requestParams)} from generate_series(1,100000)g`;
    await client.unsafe("analyze media_items; analyze media_item_metadata; analyze entry_creators; analyze creator_requests; analyze creator_request_media_items; analyze provider_snapshots");
    const bggExplain = async (name: string, query: { sql: string; params: unknown[] }) => {
      const [row] = await client.unsafe(`explain(analyze,buffers,format json) ${query.sql}`, query.params as never[]);
      const result = row["QUERY PLAN"][0];
      appendFileSync(artifact, JSON.stringify({ name, ...query, result }) + "\n");
      t.diagnostic(JSON.stringify({ name, ms: result["Execution Time"], rows: result.Plan["Actual Rows"], buffers: result.Plan["Shared Hit Blocks"] + result.Plan["Shared Read Blocks"] }));
      return result;
    };
    for (const state of ["absent", "rare", "common"]) {
      if (state === "rare") await client`delete from provider_snapshots where id=50999`;
      if (state === "common") await client`delete from provider_snapshots where id>50000`;
      await client`analyze provider_snapshots`;
      const result = await bggExplain(`bgg-missing-${state}`, providerSnapshotBoardgameBatchQuery({ afterId: 50000, throughId: 51000, onlyMissingSnapshots: true }).toSQL());
      assert.equal(result.Plan["Actual Rows"], state === "absent" ? 0 : state === "rare" ? 1 : 26);
      assert.ok(!nodes(result.Plan).some(n => n["Relation Name"] === "provider_snapshots" && n["Node Type"] === "Seq Scan" && Number(n["Actual Loops"]) > 1));
    }
    for (const afterId of [0, 50000]) {
      const query = db.select({ id: mediaItems.id, facts: mediaMetadataFactsSql({ mediaType: sql`'boardgame'` }) }).from(mediaItems)
        .innerJoin(mediaItemMetadata, eq(mediaItems.id, mediaItemMetadata.mediaItemId)).where(gt(mediaItems.id, afterId)).orderBy(asc(mediaItems.id)).limit(25).toSQL();
      const result = await bggExplain(`bgg-working-facts-page:${afterId}`, query);
      assert.equal(result.Plan["Actual Rows"], 25);
      assert.ok(!nodes(result.Plan).some(n => n["Relation Name"] === "provider_snapshots"));
      assert.ok(!nodes(result.Plan).some(n => ["entry_creators", "creator_request_media_items", "media_item_genres"].includes(String(n["Relation Name"])) && n["Node Type"] === "Seq Scan" && Number(n["Actual Loops"]) > 1));
    }
    t.diagnostic(`100000 games and snapshots; SQL/plans: ${artifact}`);
  } finally {
    await client.unsafe(`drop schema if exists ${schema} cascade`);
    await client.end();
  }
});
