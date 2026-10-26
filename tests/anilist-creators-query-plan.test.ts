import assert from "node:assert/strict";
import { appendFileSync, readFileSync } from "node:fs";
import { test } from "node:test";
import { and, asc, eq, gt, inArray, isNull, sql } from "drizzle-orm";

const testUrl = process.env.ANILIST_CREATORS_TEST_DATABASE_URL;

test("AniList working projections and archive membership stay bounded at 100k anime", { skip: !testUrl, timeout: 180000 }, async t => {
  const schema = `anilist_plan_${process.pid}_${Date.now()}`;
  const url = new URL(testUrl!);
  url.searchParams.set("options", `-c search_path=${schema}`);
  process.env.DATABASE_URL = url.toString();
  const { db, getDbClient } = await import("../src/db");
  const { mediaItems, mediaItemMetadata, providerSnapshots, providerSnapshotLinks, creatorRequests } = await import("../src/db/schema");
  const { animeCreatorRoleJsonSql } = await import("../src/db/queries/anilist-creator-display");
  const { creatorCondition } = await import("../src/db/queries/creators");
  const { getAnimeMissingCreatorRosterQuery } = await import("../src/db/queries/anilist-creators-backfill");
  const { mediaMetadataFactsSql } = await import("../src/db/queries/book-metadata");
  const client = getDbClient();
  try {
    await client.unsafe(`create schema ${schema};
      create unlogged table creator_roles(id integer primary key,code text);
      insert into creator_roles values(1,'director'),(2,'production_company'),(3,'producer'),(4,'writer');
      create unlogged table creators(id integer primary key,name text,name_ru text,slug text);
      insert into creators select g,'Creator '||g,null,'creator-'||g from generate_series(1,200000)g;
      create unlogged table media_items(id integer primary key,media_type text,publication_status text,title text);
      insert into media_items select g,'anime','published','Anime '||g from generate_series(1,100000)g;
      create unlogged table media_item_metadata(media_item_id integer primary key,source_provider text,source_external_id text,facts jsonb);
      insert into media_item_metadata select g,case when g%2=0 then 'jikan' else 'anilist' end,g::text,'{}'::jsonb from generate_series(1,100000)g;
      create unlogged table creator_requests(id integer primary key,provider text,external_creator_id text,media_type text,decision text,manually_reopened boolean,apply_status text default 'pending');
      insert into creator_requests select g,'anilist',case when g%3=1 then 'person:' else 'studio:' end||g,'anime',case when g%11=0 then null else 'bind' end,false,'pending' from generate_series(1,200000)g;
      create unique index request_identity on creator_requests(provider,external_creator_id) where external_creator_id is not null;
      create unlogged table creator_request_media_items(request_id integer,media_item_id integer,role_id integer,external_creator_name text,source_position integer,primary key(request_id,media_item_id,role_id));
      insert into creator_request_media_items select ((g-1)*10+p)%199999+1,g,(p%3)+1,'Creator '||(((g-1)*10+p)%199999+1),p from generate_series(1,100000)g cross join generate_series(0,9)p;
      create index occurrence_media on creator_request_media_items(media_item_id);
      create unlogged table provider_creator_bindings(id integer primary key,creator_id integer,provider text,external_creator_id text,external_creator_name text,active boolean);
      insert into provider_creator_bindings select g,g,'anilist',case when g%3=1 then 'person:' else 'studio:' end||g,'Creator '||g,true from generate_series(1,200000)g;
      create unique index binding_identity on provider_creator_bindings(provider,external_creator_id) where active;
      create unlogged table entry_creators(entry_id integer,creator_id integer,role_id integer,is_manual boolean,primary key(entry_id,creator_id,role_id));
      insert into entry_creators select media_item_id,request_id,role_id,false from creator_request_media_items where request_id%11<>0;
      create index entry_creators_creator_idx on entry_creators(creator_id);
      create unlogged table entry_creator_sources(entry_id integer,creator_id integer,role_id integer,provider text,binding_id integer,source_position integer,normalized_external_creator_name text,primary key(entry_id,creator_id,role_id,provider,normalized_external_creator_name));
      insert into entry_creator_sources select media_item_id,request_id,role_id,'anilist',request_id,source_position,'anilist:'||request_id from creator_request_media_items where request_id%11<>0;
      insert into entry_creators select g,200000,3,false from generate_series(1,20000)g;
      insert into entry_creator_sources select g,200000,3,'anilist',200000,10,'anilist:studio:200000' from generate_series(1,20000)g;
      insert into entry_creators values(100000,199999,3,true) on conflict do nothing;
      create unlogged table provider_creator_exclusions(provider text,external_creator_id text,media_type text,normalized_external_creator_name text);
      create unique index exclusion_identity on provider_creator_exclusions(provider,external_creator_id) where external_creator_id is not null;
      create unique index exclusion_name on provider_creator_exclusions(provider,media_type,normalized_external_creator_name) where external_creator_id is null;
      create unlogged table entry_creator_pseudonyms(entry_id integer,creator_id integer,role_id integer);
      create index pseudonym_creator on entry_creator_pseudonyms(creator_id);
      create unlogged table creator_relations(source_creator_id integer,target_creator_id integer,relation_type text);
      create index relation_target on creator_relations(target_creator_id);
      create unlogged table provider_snapshots(id integer primary key,provider_code text,resource_type text,external_id text,api_method text,request_key text);
      insert into provider_snapshots select g,'anilist','anime',g::text,'anime.creators','version1' from generate_series(1,100000)g;
      create unlogged table provider_snapshot_links(snapshot_id integer,entity_type text,entity_id text,purpose text,primary key(snapshot_id,entity_type,entity_id,purpose));
      insert into provider_snapshot_links select g,'media-item',g::text,'dependency' from generate_series(1,100000)g;
      create index provider_snapshot_links_entity_idx on provider_snapshot_links(entity_type,entity_id,purpose,snapshot_id);
      analyze;`);
    const artifact = `/tmp/${schema}.jsonl`;
    t.diagnostic(`Full SQL and execution plans: ${artifact}`);
    const explain = async (name: string, query: { sql: string; params: unknown[] }, execute = true) => {
      const [row] = await client.unsafe(`explain (${execute ? "analyze,buffers," : ""}format json) ${query.sql}`, query.params as never[]);
      const result = row["QUERY PLAN"][0];
      appendFileSync(artifact, JSON.stringify({ name, scale: { anime: 100000, creators: 200000, occurrences: 1000000, sources: 929090 }, sql: query.sql, params: query.params, result }) + "\n");
      t.diagnostic(JSON.stringify({ name, ms: result["Execution Time"], rows: result.Plan["Actual Rows"], buffers: (result.Plan["Shared Hit Blocks"] ?? 0) + (result.Plan["Shared Read Blocks"] ?? 0), indexes: [...new Set(nodes(result.Plan).flatMap(node => node["Index Name"] ? [node["Index Name"]] : []))] }));
      return result;
    };
    const nodes = (plan: Record<string, unknown>): Record<string, unknown>[] => [plan, ...((plan.Plans as Record<string, unknown>[] | undefined) ?? []).flatMap(nodes)];
    for (const id of [1, 100000, 100001]) {
      const plan = await explain(`public:${id}`, db.select({ directors: animeCreatorRoleJsonSql("director"), productionCompanies: animeCreatorRoleJsonSql("production_company"), producers: animeCreatorRoleJsonSql("producer") }).from(mediaItems).where(eq(mediaItems.id, id)).toSQL());
      assert.equal(plan.Plan["Actual Rows"], id === 100001 ? 0 : 1);
      const unbounded = nodes(plan.Plan).filter(node => ["entry_creators", "entry_creator_sources", "creator_request_media_items", "creators", "creator_requests", "provider_creator_bindings"].includes(node["Relation Name"] as string) && node["Node Type"] === "Seq Scan");
      assert.deepEqual(unbounded, [], "single-record display must not scan all participation or identities");
      assert.ok(plan.Plan["Shared Hit Blocks"] + plan.Plan["Shared Read Blocks"] < 5000);
    }
    for (const creatorId of [200000, 199999, 900000]) {
      const condition = and(eq(mediaItems.mediaType, "anime"), eq(mediaItems.publicationStatus, "published"), creatorCondition(creatorId));
      const count = await explain(`archive-count:${creatorId}`, db.select({ count: sql`count(*)` }).from(mediaItems).where(condition).toSQL());
      await explain(`archive-page:${creatorId}`, db.select({ id: mediaItems.id }).from(mediaItems).where(condition).orderBy(asc(mediaItems.id)).limit(25).toSQL());
      assert.ok(nodes(count.Plan).some(node => node["Index Name"] === "entry_creators_creator_idx"));
    }
    for (const id of [42, 100001]) {
      await explain(`sync-snapshot:${id}`, db.select({ id: providerSnapshots.id }).from(providerSnapshotLinks).innerJoin(providerSnapshots, eq(providerSnapshots.id, providerSnapshotLinks.snapshotId)).where(and(eq(providerSnapshotLinks.entityType, "media-item"), eq(providerSnapshotLinks.entityId, String(id)), eq(providerSnapshotLinks.purpose, "dependency"), eq(providerSnapshots.providerCode, "anilist"), eq(providerSnapshots.resourceType, "anime"), eq(providerSnapshots.apiMethod, "anime.creators"), eq(providerSnapshots.requestKey, "version1"))).toSQL());
    }
    await explain("approval-pending", db.select({ id: creatorRequests.id }).from(creatorRequests).where(and(eq(creatorRequests.provider, "anilist"), sql`(${creatorRequests.externalCreatorId} like 'person:%' or ${creatorRequests.externalCreatorId} like 'studio:%')`, isNull(creatorRequests.decision), eq(creatorRequests.manuallyReopened, false), eq(creatorRequests.applyStatus, "pending"), gt(creatorRequests.id, 100000), sql`exists (select 1 from creator_request_media_items o where o.request_id=${creatorRequests.id})`)).orderBy(asc(creatorRequests.id)).limit(100).toSQL());
    // The source-pruning mutation is planned only: application data is never benchmark-mutated.
    await explain("prune-source-write", { sql: "delete from entry_creator_sources where entry_id=$1 and provider='anilist' and role_id in (1,2,3)", params: [42] }, false);
    for (const state of ["common", "rare", "absent"]) {
      if (state === "rare") await client.unsafe(`update media_item_metadata set facts='{"anilistCreatorsComplete":true}'; update media_item_metadata set facts='{}' where media_item_id in (99990,100000); analyze media_item_metadata`);
      if (state === "absent") await client.unsafe(`update media_item_metadata set facts='{"anilistCreatorsComplete":true}'; analyze media_item_metadata`);
      await client.unsafe("drop index if exists media_item_metadata_anilist_creators_pending_idx");
      const beforeCursorPushdown = db.select({ id: mediaItems.id, title: mediaItems.title, sourceProvider: mediaItemMetadata.sourceProvider, sourceExternalId: mediaItemMetadata.sourceExternalId }).from(mediaItems).innerJoin(mediaItemMetadata, eq(mediaItemMetadata.mediaItemId, mediaItems.id)).where(and(eq(mediaItems.mediaType, "anime"), gt(mediaItems.id, 50000), eq(mediaItems.publicationStatus, "published"), inArray(mediaItemMetadata.sourceProvider, ["anilist", "jikan"]), sql`${mediaItemMetadata.sourceExternalId} ~ '^[1-9][0-9]*$'`, sql`not (${mediaItemMetadata.facts} @> '{"anilistCreatorsComplete":true}'::jsonb or ${mediaItemMetadata.facts} @> '{"anilistCreatorsUnavailable":true}'::jsonb)`)).orderBy(asc(mediaItems.id)).limit(25);
      await explain(`backfill-before-cursor-and-index:${state}`, beforeCursorPushdown.toSQL());
      const statement = readFileSync("drizzle/0144_anilist_creators.sql", "utf8").split("--> statement-breakpoint").find(part => part.includes("CREATE INDEX media_item_metadata_anilist_creators_pending_idx"));
      assert.ok(statement);
      await client.unsafe(statement);
      await client.unsafe("analyze media_item_metadata");
      const plan = await explain(`backfill-after-index:${state}`, getAnimeMissingCreatorRosterQuery(25, 50000).toSQL());
      assert.equal(plan.Plan["Actual Rows"], state === "common" ? 25 : state === "rare" ? 2 : 0);
      assert.ok(nodes(plan.Plan).some(node => node["Index Name"] === "media_item_metadata_anilist_creators_pending_idx"));
    }
    await explain("compatibility-single", db.select({ facts: mediaMetadataFactsSql() }).from(mediaItems).innerJoin(mediaItemMetadata, eq(mediaItemMetadata.mediaItemId, mediaItems.id)).where(eq(mediaItems.id, 100000)).toSQL());
    await explain("compatibility-page", db.select({ facts: mediaMetadataFactsSql() }).from(mediaItems).innerJoin(mediaItemMetadata, eq(mediaItemMetadata.mediaItemId, mediaItems.id)).orderBy(asc(mediaItems.id)).limit(25).toSQL());
  } finally {
    await client.unsafe(`drop schema ${schema} cascade`);
    await client.end();
  }
});
