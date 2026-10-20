import assert from "node:assert/strict";
import { test } from "node:test";
import { PgDialect } from "drizzle-orm/pg-core";
import { sql } from "drizzle-orm";
import { mediaMetadataFactsSql } from "@/db/queries/book-metadata";

test("normalized book reads preserve ordering and scale using working-table indexes", { skip: process.env.PROVIDER_SNAPSHOT_TEST !== "1" }, async (t) => {
  await import("dotenv/config");
  const { default: postgres } = await import("postgres");
  const client = postgres(process.env.DATABASE_URL!, { max: 1, prepare: false });
  const schema = `book_reads_${process.pid}_${Date.now()}`;
  const originalUrl = process.env.DATABASE_URL!;
  const auditUrl = new URL(originalUrl);
  auditUrl.searchParams.set("options", `-c search_path=${schema},public`);
  process.env.DATABASE_URL = auditUrl.toString();
  let closeAuditClient: (() => Promise<void>) | undefined;
  try {
    await client.unsafe(`create schema ${schema}; set search_path=${schema},public;
      create table media_items(id integer primary key,media_type text);
      create table media_item_metadata(media_item_id integer primary key,source_provider text,source_external_id text,facts jsonb,original_language text);
      create table provider_settings(media_type text,provider_code text,normalized_book_metadata boolean not null default false,updated_at timestamptz default now(),primary key(media_type,provider_code));
      insert into provider_settings(media_type,provider_code) values('book','fantlab'),('book','google-books'),('book','open-library');
      create table creator_roles(id integer primary key,code text);
      create table creators(id integer primary key,name text,slug text);
      create table entry_creators(entry_id integer,creator_id integer,role_id integer,is_manual boolean default false,primary key(entry_id,creator_id,role_id));
      create table entry_creator_sources(entry_id integer,creator_id integer,role_id integer,provider text,normalized_external_creator_name text,source_position integer,binding_id integer,
        primary key(entry_id,creator_id,role_id,provider,normalized_external_creator_name));
      create table provider_creator_bindings(id integer primary key,external_creator_id text);
      create table entry_creator_pseudonyms(entry_id integer primary key);
      create table provider_creator_exclusions(provider text,media_type text,normalized_external_creator_name text,external_creator_id text);
      create table creator_requests(provider text,media_type text,normalized_external_creator_name text,external_creator_id text,manually_reopened boolean);
      create table provider_snapshots(id integer primary key,provider_code text,external_id text,resource_type text,api_method text,request_params jsonb default '{}');
      create table provider_snapshot_links(snapshot_id integer,entity_type text,entity_id text,purpose text);
      create index snapshot_links_entity_idx on provider_snapshot_links(entity_type,entity_id);
      insert into creator_roles values(1,'writer'),(2,'publisher');
      insert into creators select g,'Creator '||g,'creator-'||g from generate_series(1,10000)g;
      insert into media_items select g,'book' from generate_series(1,100000)g;
      insert into media_item_metadata select id,'fantlab',id::text,'{"authors":["Legacy author"],"unknown":"legacy"}', 'ru' from media_items;
      insert into entry_creators(entry_id,creator_id,role_id) select id,((id+n)%10000)+1,case when n=3 then 2 else 1 end from media_items cross join generate_series(1,3)n;
      insert into entry_creator_sources(entry_id,creator_id,role_id,provider,normalized_external_creator_name,source_position) select entry_id,creator_id,role_id,'fantlab','source-'||creator_id,
        case when creator_id=((entry_id+1)%10000)+1 then 1 else 0 end from entry_creators;
      analyze media_items; analyze media_item_metadata; analyze creators; analyze creator_roles; analyze entry_creators; analyze entry_creator_sources;`);
    const dialect = new PgDialect();
    for (const enabled of [false, true]) {
      await client`update provider_settings set normalized_book_metadata=${enabled} where media_type='book' and provider_code='fantlab'`;
      for (const id of [42, 99999, 100001]) {
        const query = dialect.sqlToQuery(sql`select ${mediaMetadataFactsSql()} as facts from media_items
          left join media_item_metadata on media_item_metadata.media_item_id=media_items.id where media_items.id=${id}`);
        const rows = await client.unsafe(query.sql, query.params as never[]);
        if (id === 42) {
          assert.deepEqual(rows[0].facts, enabled ? { authors: ["Creator 45", "Creator 44"], publishers: ["Creator 46"], originalLanguage: "ru" } : { authors: ["Legacy author"], unknown: "legacy" });
        }
        const [row] = await client.unsafe("explain(analyze,buffers,format json) " + query.sql, query.params as never[]);
        const plan = row["QUERY PLAN"][0];
        const nodes: Array<{ type: unknown; table: unknown; index: unknown; loops: unknown; rows: unknown }> = [];
        const visit = (node: Record<string, unknown>) => { nodes.push({ type: node["Node Type"], table:node["Relation Name"],index: node["Index Name"], loops: node["Actual Loops"],rows:node["Actual Rows"] }); for (const child of (node.Plans ?? []) as Record<string, unknown>[]) visit(child); };
        visit(plan.Plan);
        t.diagnostic(JSON.stringify({ books: 100000, sources: 300000, enabled, id, executionMs: plan["Execution Time"], nodes }));
        if(id!==100001)assert.ok(nodes.some(node=>node.table==='provider_settings'),'cutover decision is read from settings in actual SQL plan');
        if (enabled && id !== 100001) {
          assert.match(JSON.stringify(plan), /entry_creators_pkey/);
          assert.match(JSON.stringify(plan), /entry_creator_sources_pkey/);
          assert.doesNotMatch(JSON.stringify(plan), /provider_snapshots/);
        }
      }
    }
    const { getDbClient } = await import("@/db");
    const auditClient = getDbClient();
    closeAuditClient = async () => { auditClient.options.debug = false; await auditClient.end(); };
    const { entryProviderWriterCreatorsJsonSql } = await import("@/db/queries/creators");
    for (const enabled of [false, true]) {
      await client`update provider_settings set normalized_book_metadata=${enabled} where media_type='book' and provider_code='fantlab'`;
      const query = dialect.sqlToQuery(sql`select ${entryProviderWriterCreatorsJsonSql(sql`42`)} as authors`);
      const [row] = await client.unsafe(query.sql, query.params as never[]);
      assert.deepEqual(row.authors.map((author: { id: number }) => author.id), enabled ? [45, 44] : [44, 45]);
      const [explained] = await client.unsafe("explain(analyze,buffers,format json) " + query.sql, query.params as never[]);
      const plan = explained["QUERY PLAN"][0];
      t.diagnostic(JSON.stringify({ providerWriterOrder: true, enabled, executionMs: plan["Execution Time"], books: 100000, sources: 300000 }));
      assert.match(JSON.stringify(plan), /entry_creator_sources_pkey/);
    }
    // Audit is a deployment gate, so ambiguity blocks cutover without modifying data.
    await client.unsafe(`update media_item_metadata set source_provider='google-books',source_external_id='abc',facts='{"authors":["Creator 45","Creator 44"],"publishers":["Creator 46"],"originalLanguage":"ru"}' where media_item_id=42;
      update entry_creator_sources set provider='google-books' where entry_id=42;
      insert into provider_snapshots(id,provider_code,external_id,resource_type,api_method) values(1,'google-books','abc','volume','volumes.get');
      insert into provider_snapshot_links values(1,'media-item','42','primary');`);
    const { auditNormalizedBookCutover } = await import("@/lib/providers/book-cutover-check");
    const auditQueries: Array<{ query: string; params: unknown[] }> = [];
    auditClient.options.debug = (_connection, query, params) => { if (query.trim().startsWith("select")) auditQueries.push({ query, params }); };
    let [report] = await auditNormalizedBookCutover(["google-books"]);
    auditClient.options.debug = false;
    assert.equal(report.ready, true);
    assert.equal(report.books, 1);
    for (const { query, params } of auditQueries) {
      const [row] = await client.unsafe("explain(analyze,buffers,format json) " + query, params as never[]);
      const plan = row["QUERY PLAN"][0];
      t.diagnostic(JSON.stringify({ auditQuery: query.match(/from "([^"]+)"/)?.[1], executionMs: plan["Execution Time"], books: 100000, sources: 300000 }));
      assert.doesNotMatch(query, /"payload"/);
    }
    await client.unsafe(`update entry_creator_sources set source_position=null where entry_id=42 and creator_id=44;
      update media_item_metadata set facts=facts||'{"unknown":"preserve","authors":["Missing author"]}' where media_item_id=42;`);
    [report] = await auditNormalizedBookCutover(["google-books"]);
    assert.equal(report.ready, false);
    assert.deepEqual(new Set(report.issues.map((issue) => issue.code)), new Set(["CONTRIBUTOR_POSITION_MISSING", "UNMIGRATED_LEGACY_FIELD", "UNMATCHED_LEGACY_CONTRIBUTOR"]));
    await client.unsafe(`update entry_creator_sources set source_position=1 where entry_id=42 and creator_id=44;
      update media_item_metadata set facts=facts-'unknown' where media_item_id=42;
      insert into creator_requests values('google-books','book','missing author',null,true);`);
    [report] = await auditNormalizedBookCutover(["google-books"]);
    assert.equal(report.ready, true, "manually reopened author decision is preserved");
    // Actual backfill batch SQL, before/after its source+cursor index.
    // batchSize=24 plus the lookahead reproduces the previous fixed LIMIT 25.
    const {providerSnapshotBookBatchQuery}=await import("@/db/queries/provider-snapshot-jobs");
    await client.unsafe("update media_item_metadata set source_provider='open-library' where media_item_id=99999; analyze media_item_metadata");
    for(const indexed of [false,true]) {
      if(indexed) await client.unsafe("create index media_item_metadata_source_entry_idx on media_item_metadata(source_provider,media_item_id); analyze media_item_metadata");
      for(const provider of ["fantlab","open-library","google-books"] as const) for(const batchSize of [1,24,25,100]) {
        const afterId=provider==='google-books'?100:0;
        const query=providerSnapshotBookBatchQuery({afterId,throughId:100000,provider,batchSize}).toSQL();
        const [explained]=await client.unsafe("explain(analyze,buffers,format json) "+query.sql,query.params as never[]);
        const plan=explained["QUERY PLAN"][0];
        t.diagnostic(JSON.stringify({batchProvider:provider,batchSize,indexed,executionMs:plan["Execution Time"],books:100000,plan:plan.Plan}));
        if(indexed && provider!=="fantlab") assert.match(JSON.stringify(plan),/media_item_metadata_source_entry_idx/);
      }
    }
  } finally {
    await closeAuditClient?.();
    process.env.DATABASE_URL = originalUrl;
    await client.unsafe(`drop schema if exists ${schema} cascade`);
    await client.end();
  }
});
