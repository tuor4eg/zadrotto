import assert from "node:assert/strict";
import { test } from "node:test";

test("TMDB film batch SQL remains bounded at representative scale", {
  skip: process.env.PROVIDER_SNAPSHOT_PERF_TEST !== "1",
}, async () => {
  const { default: postgres } = await import("postgres");
  const original = process.env.DATABASE_URL!;
  const admin = postgres(original, { max: 1, onnotice: () => undefined });
  const schema = `tmdb_perf_${process.pid}_${Date.now()}`;
  await admin.unsafe(`create schema ${schema}`);
  const url = new URL(original);
  url.searchParams.set("options", `-c search_path=${schema},public`);
  process.env.DATABASE_URL = url.toString();
  const { getDbClient } = await import("../src/db");
  const client = getDbClient();
  try {
    await client.unsafe(`
      create table media_items(id integer primary key, media_type text not null);
      create table media_item_metadata(media_item_id integer primary key, source_provider text, source_external_id text);
      create index media_item_metadata_source_entry_idx on media_item_metadata(source_provider,media_item_id);
      insert into media_items select id,case when id%10=0 then 'film' when id%10=1 then 'series' else 'book' end from generate_series(1,300000) id;
      insert into media_item_metadata select id,case when id%10 in (0,1) then 'tmdb' else 'fantlab' end,id::text from generate_series(1,300000) id;
      analyze media_items; analyze media_item_metadata;
    `);
    const { providerSnapshotBookBatchQuery } = await import("../src/db/queries/provider-snapshot-jobs");
    type Plan = { "Node Type": string; "Actual Rows": number; "Actual Loops": number; "Shared Hit Blocks": number; "Shared Read Blocks": number; Plans?: Plan[] };
    const measure = async (label: string, query: {sql: string; params: unknown[]}) => {
      const rows = await client.unsafe(`explain (analyze,buffers,format json) ${query.sql}`, query.params as never[]);
      const result = rows[0]["QUERY PLAN"][0] as {Plan: Plan; "Execution Time": number};
      console.log(label, JSON.stringify(result));
      return result;
    };
    const compiled = providerSnapshotBookBatchQuery({provider:"tmdb",afterId:150000,throughId:300000}).toSQL();
    assert.doesNotMatch(compiled.sql, /\boffset\b|\bcount\s*\(/i);
    const common = await measure("common",compiled);
    assert.equal(common.Plan["Actual Rows"],26);
    const nodes = (plan: Plan): Plan[] => [plan,...(plan.Plans ?? []).flatMap(nodes)];
    assert.ok(nodes(common.Plan).every(node => node["Actual Loops"] <= 100), "bounded join work, no per-row subquery over the full range");
    // Baseline: the previous selector shape had a keyset bound only on metadata.
    await measure("before-range-on-both-sides", {sql:compiled.sql
      .replaceAll('"media_items"."id" >','"media_item_metadata"."media_item_id" >')
      .replaceAll('"media_items"."id" <=','"media_item_metadata"."media_item_id" <='), params:compiled.params});
    await client.unsafe("update media_item_metadata set source_provider='other' where media_item_id%10 in (0,1) and media_item_id<>299990; analyze media_item_metadata");
    await client.unsafe("vacuum analyze media_item_metadata");
    const rare = await measure("rare",compiled);
    assert.equal(rare.Plan["Actual Rows"],1);
    assert.ok(rare.Plan["Shared Hit Blocks"] + rare.Plan["Shared Read Blocks"] < 100, "rare source uses the existing composite index");
    await client.unsafe("update media_item_metadata set source_provider='other' where source_provider='tmdb'; analyze media_item_metadata");
    await client.unsafe("vacuum analyze media_item_metadata");
    const absent = await measure("absent",compiled);
    assert.equal(absent.Plan["Actual Rows"],0);
    assert.ok(absent.Plan["Shared Hit Blocks"] + absent.Plan["Shared Read Blocks"] < 20);
    const explicit = providerSnapshotBookBatchQuery({provider:"tmdb",afterId:150000,throughId:300000,mediaItemIds:[150010,150020,150030]}).toSQL();
    await measure("explicit-ids",explicit);
    await client.unsafe(`create table provider_snapshots(id integer primary key,provider_code text,resource_type text,external_id text,api_method text,request_params jsonb,request_key text);
      create unique index provider_snapshots_request_unique on provider_snapshots(provider_code,resource_type,external_id,api_method,request_key);
      update media_item_metadata set source_provider='tmdb' where media_item_id%10 in (0,1);
      insert into provider_snapshots select id,'tmdb','movie',id::text,'movie.details','{"language":"ru-RU","append_to_response":"credits"}','request' from media_items where media_type='film' and id%20=0;
      insert into provider_snapshots select id,'fantlab','work',id::text,'search-ids',jsonb_build_object('w',id::text),'request' from media_items where media_type='book' and id%2=0;
      analyze provider_snapshots;analyze media_item_metadata;`);
    for (const provider of ["tmdb","fantlab"] as const) {
      const missing = providerSnapshotBookBatchQuery({provider,afterId:150000,throughId:300000,onlyMissingSnapshots:true}).toSQL();
      assert.doesNotMatch(missing.sql, /"payload"/);
      const result = await measure(`missing-common-${provider}`,missing);
      assert.equal(result.Plan["Actual Rows"],26);
    }
    await client.unsafe(`insert into provider_snapshots select id,'tmdb','movie',id::text,'movie.details','{"language":"ru-RU","append_to_response":"credits"}','request' from media_items where media_type='film' and id<>299990 on conflict do nothing;
      analyze provider_snapshots;`);
    const missingFilm = providerSnapshotBookBatchQuery({provider:"tmdb",afterId:150000,throughId:300000,onlyMissingSnapshots:true}).toSQL();
    assert.equal((await measure("missing-rare-tmdb",missingFilm)).Plan["Actual Rows"],1);
    await client.unsafe(`insert into provider_snapshots values(299990,'tmdb','movie','299990','movie.details','{"language":"ru-RU","append_to_response":"credits"}','request');analyze provider_snapshots;`);
    assert.equal((await measure("missing-absent-tmdb",missingFilm)).Plan["Actual Rows"],0);

  } finally {
    await client.end();
    await admin.unsafe(`drop schema ${schema} cascade`);
    await admin.end();
    process.env.DATABASE_URL = original;
  }
});
