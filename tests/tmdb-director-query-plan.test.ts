import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { test } from "node:test";
import { and, asc, eq, gt, lte, sql, isNull } from "drizzle-orm";
const testUrl = process.env.TMDB_DIRECTORS_TEST_DATABASE_URL;

test("director queries use bounded indexes at representative scale", { skip: !testUrl, timeout: 180000 }, async t => {
  const schema = `tmdb_director_plan_${process.pid}_${Date.now()}`;
  const url = new URL(testUrl!); url.searchParams.set("options", `-c search_path=${schema}`);
  process.env.DATABASE_URL = url.toString();
  const { db, getDbClient } = await import("../src/db");
  const { mediaItems, mediaItemMetadata, creatorRequests, creatorRequestMediaItems, providerSnapshotLinks, providerSnapshots, providerCreatorBindings } = await import("../src/db/schema");
  const { tmdbPersonNameCandidateQuery, tmdbPersonAliasCandidateQuery } = await import("../src/db/queries/tmdb-person-identity");
  const { filmCreatorRoleJsonSql } = await import("../src/db/queries/tmdb-company-display");
  const { creatorSnapshotBatchQuery } = await import("../src/db/queries/creator-provider-snapshots");
  const { creatorProfileBindingBatchQuery } = await import("../src/db/queries/creator-profile-snapshots");
  const { snapshotHash } = await import("../src/lib/providers/snapshot-values");
  const personKey = snapshotHash({ language: "ru-RU" });
  const client = getDbClient();
  try {
    await client.unsafe(`create schema ${schema};
      create unlogged table creator_types(id integer primary key,code text); insert into creator_types values(1,'person'),(2,'organization');
      create unlogged table creator_roles(id integer primary key,code text); insert into creator_roles values(1,'director'),(2,'production_company');
      create unlogged table creators(id integer primary key,name text,original_name text,slug text,type_id integer);
      insert into creators select g,case when g<101 then 'Common' else 'Person '||g end,case when g=42 then 'Rare Original' end,'creator-'||g,1 from generate_series(1,200000)g;
      create unlogged table provider_creator_mappings(id integer primary key,creator_id integer,normalized_external_creator_name text);
      insert into provider_creator_mappings select g,g,'alias '||g from generate_series(1,200000)g;
      create unlogged table media_items(id integer primary key,media_type text);
      insert into media_items select g,'film' from generate_series(1,100000)g;
      create unlogged table media_item_metadata(media_item_id integer primary key,source_provider text,source_external_id text);
      insert into media_item_metadata select g,'tmdb',g::text from generate_series(1,100000)g;
      create unlogged table creator_requests(id integer primary key,provider text,external_creator_id text,media_type text,decision text,manually_reopened boolean,apply_status text);
      insert into creator_requests select g,'tmdb','person:'||g,'film',null,false,'pending' from generate_series(1,200000)g;
      create unique index request_identity on creator_requests(provider,external_creator_id) where external_creator_id is not null;
      create unlogged table creator_request_media_items(request_id integer,media_item_id integer,role_id integer,external_creator_name text,source_position integer,primary key(request_id,media_item_id,role_id));
      insert into creator_request_media_items select ((g-1)%200000)+1,((g-1)/200000)*20000+((g-1)%20000)+1,1,'Person '||(((g-1)%200000)+1),g%10 from generate_series(1,1000000)g;
      create index occurrence_media on creator_request_media_items(media_item_id);
      create unlogged table provider_creator_bindings(id integer primary key,creator_id integer,provider text,external_creator_id text,external_creator_name text,active boolean);
      insert into provider_creator_bindings select g,g,'tmdb','person:'||g,'Person '||g,true from generate_series(1,200000)g;
      create unique index binding_identity on provider_creator_bindings(provider,external_creator_id) where active;
      create index binding_creator on provider_creator_bindings(creator_id);
      create index provider_creator_bindings_history_idx on provider_creator_bindings(provider,external_creator_id);
      create unlogged table entry_creators(entry_id integer,creator_id integer,role_id integer,is_manual boolean,primary key(entry_id,creator_id,role_id));
      insert into entry_creators select media_item_id,request_id,role_id,false from creator_request_media_items;
      create unlogged table entry_creator_sources(entry_id integer,creator_id integer,role_id integer,provider text,binding_id integer,source_position integer,normalized_external_creator_name text,primary key(entry_id,creator_id,role_id,provider,normalized_external_creator_name));
      insert into entry_creator_sources select media_item_id,request_id,role_id,'tmdb',request_id,source_position,'tmdb:person:'||request_id from creator_request_media_items;
      insert into creator_request_media_items select 1,g,1,'Person 1',0 from generate_series(80002,100000)g on conflict do nothing;
      insert into entry_creators select g,1,1,false from generate_series(80002,100000)g on conflict do nothing;
      insert into entry_creator_sources select g,1,1,'tmdb',1,0,'tmdb:person:1' from generate_series(80002,100000)g on conflict do nothing;
      create index source_binding on entry_creator_sources(binding_id);
      create unlogged table provider_creator_exclusions(provider text,external_creator_id text,media_type text,normalized_external_creator_name text);
      create unique index exclusion_identity on provider_creator_exclusions(provider,external_creator_id) where external_creator_id is not null;
      create unique index exclusion_name on provider_creator_exclusions(provider,media_type,normalized_external_creator_name) where external_creator_id is null;
      create unlogged table provider_snapshots(id integer primary key,provider_code text,resource_type text,external_id text,api_method text,request_params jsonb,request_key text);
      create unique index snapshot_identity on provider_snapshots(provider_code,resource_type,external_id,api_method,request_key);
      create unlogged table provider_snapshot_links(snapshot_id integer,entity_type text,entity_id text,purpose text,primary key(snapshot_id,entity_type,entity_id));
      create index snapshot_entity on provider_snapshot_links(entity_type,entity_id);
      insert into provider_snapshots select g,'tmdb','person',g::text,'person.details','{"language":"ru-RU"}','${personKey}' from generate_series(1,200000)g;
      insert into provider_snapshot_links select ((g-1)%200000)+1,'creator',g::text,'primary' from generate_series(1,1000000)g;
      analyze;`);
    const explain = async (name: string, query: { sql: string; params: unknown[] }, execute = true) => {
      const [row] = await client.unsafe(`explain (${execute ? "analyze,buffers," : ""}format json) ` + query.sql, query.params as never[]);
      const result = row["QUERY PLAN"][0];
      t.diagnostic(JSON.stringify({ name, scale: { films: 100000, creators: 200000, sources: 1000000, occurrences: 1000000, links: 1000000 }, ms: result["Execution Time"], plan: result.Plan }));
      return result;
    };
    await explain("alias-before", tmdbPersonAliasCandidateQuery("absent").toSQL());
    const before = await explain("name-before", tmdbPersonNameCandidateQuery("absent").toSQL());
    assert.match(JSON.stringify(before), /Seq Scan/);
    for (const statement of readFileSync("drizzle/0135_tmdb_company_creators.sql", "utf8").split("--> statement-breakpoint").filter(s => /CREATE INDEX creators_(name|original_name)_exact_idx/.test(s))) await client.unsafe(statement);
    await client.unsafe("create index provider_creator_mappings_name_creator_idx on provider_creator_mappings(normalized_external_creator_name,creator_id); analyze creators; analyze provider_creator_mappings");
    for (const name of ["common", "rare original", "absent"]) {
      const result = await explain("name-after:" + name, tmdbPersonNameCandidateQuery(name).toSQL());
      assert.ok(result.Plan["Shared Hit Blocks"] + result.Plan["Shared Read Blocks"] < 40);
    }
    for (const name of ["alias 42", "absent"]) {
      const result = await explain("alias:" + name, tmdbPersonAliasCandidateQuery(name).toSQL());
      assert.match(JSON.stringify(result), /provider_creator_mappings_name_creator_idx/);
    }
    const backfill = db.select({ id: mediaItems.id }).from(mediaItems).innerJoin(mediaItemMetadata, eq(mediaItemMetadata.mediaItemId, mediaItems.id)).where(and(eq(mediaItems.mediaType, "film"), eq(mediaItemMetadata.sourceProvider, "tmdb"), sql`${mediaItemMetadata.sourceExternalId} is not null`, gt(mediaItems.id, 50000), lte(mediaItems.id, 100000))).orderBy(asc(mediaItems.id)).limit(26);
    await explain("backfill", backfill.toSQL());
    const approval = db.select({ id: creatorRequests.id }).from(creatorRequests).where(and(eq(creatorRequests.provider, "tmdb"), sql`${creatorRequests.externalCreatorId} like 'person:%'`, isNull(creatorRequests.decision), eq(creatorRequests.manuallyReopened, false), eq(creatorRequests.applyStatus, "pending"), gt(creatorRequests.id, 100000), sql`exists (select 1 from creator_request_media_items o where o.request_id=${creatorRequests.id})`)).orderBy(asc(creatorRequests.id)).limit(100);
    await explain("approval", approval.toSQL());
    for (const id of [1, 99999, 100001]) {
      await explain("public:" + id, db.select({ directors: filmCreatorRoleJsonSql("director", sql`${mediaItems}."id"`) }).from(mediaItems).where(eq(mediaItems.id, id)).toSQL());
      await explain("apply-occurrences:" + id, db.selectDistinct({ id: creatorRequestMediaItems.mediaItemId }).from(creatorRequestMediaItems).where(and(eq(creatorRequestMediaItems.requestId, id), gt(creatorRequestMediaItems.mediaItemId, 0))).orderBy(asc(creatorRequestMediaItems.mediaItemId)).limit(100).toSQL());
    }
    const { normalizeSearchSql } = await import("../src/db/search");
    await explain("dry-run-observed-names", db.selectDistinct({ name: normalizeSearchSql(creatorRequestMediaItems.externalCreatorName) }).from(creatorRequestMediaItems).where(and(eq(creatorRequestMediaItems.requestId, 1), sql`${creatorRequestMediaItems.mediaItemId} <> ${1}`)).limit(2).toSQL());
    await explain("profile-bindings-all-filled", creatorProfileBindingBatchQuery({ provider: "tmdb", afterId: 100000, throughId: 200000, batchSize: 25, onlyMissingSnapshots: true }).toSQL());
    await client.unsafe("delete from provider_snapshot_links where entity_type='creator' and entity_id in ('100001','100002')");
    await explain("profile-bindings-rare-missing", creatorProfileBindingBatchQuery({ provider: "tmdb", afterId: 100000, throughId: 100010, batchSize: 25, onlyMissingSnapshots: true }).toSQL());
    for (const externalId of ["person:42", "person:900000"]) {
      const plan = await explain("binding-history:" + externalId, db.select({ id: providerCreatorBindings.id }).from(providerCreatorBindings).where(and(eq(providerCreatorBindings.provider, "tmdb"), eq(providerCreatorBindings.externalCreatorId, externalId))).limit(1).toSQL());
      assert.match(JSON.stringify(plan), /provider_creator_bindings_history_idx/);
    }
    await explain("date-processing-party", creatorSnapshotBatchQuery({ provider: "tmdb", afterId: 100000, throughId: 200000, batchSize: 25 }).toSQL());
    await explain("date-processing-missing", creatorSnapshotBatchQuery({ provider: "tmdb", afterId: 100000, throughId: 100010, batchSize: 25, onlyMissingSnapshots: true }).toSQL());
    await explain("date-binding-share", db.select({ id: providerCreatorBindings.id, externalCreatorId: providerCreatorBindings.externalCreatorId }).from(providerCreatorBindings).where(and(eq(providerCreatorBindings.creatorId, 42), eq(providerCreatorBindings.provider, "tmdb"), eq(providerCreatorBindings.active, true), sql`${providerCreatorBindings.externalCreatorId} like 'person:%'`)).orderBy(asc(providerCreatorBindings.id)).for("share").toSQL());
    await explain("binding-lookup", db.select({ id: providerCreatorBindings.id }).from(providerCreatorBindings).where(and(eq(providerCreatorBindings.provider, "tmdb"), eq(providerCreatorBindings.externalCreatorId, "person:42"), eq(providerCreatorBindings.active, true))).toSQL());
    await explain("snapshot-link-lookup", db.select({ id: providerSnapshots.id }).from(providerSnapshotLinks).innerJoin(providerSnapshots, eq(providerSnapshots.id, providerSnapshotLinks.snapshotId)).where(and(eq(providerSnapshotLinks.entityType, "creator"), eq(providerSnapshotLinks.entityId, "42"))).toSQL());
    await explain("prune-source-write", { sql: "delete from entry_creator_sources where entry_id=$1 and provider='tmdb' and role_id=$2", params: [42, 1] }, false);
    await explain("snapshot-link-write", { sql: "insert into provider_snapshot_links values($1,'creator',$2,'primary') on conflict do nothing", params: [42, "42"] }, false);
  } finally { await client.unsafe(`drop schema ${schema} cascade`); await client.end(); }
});
