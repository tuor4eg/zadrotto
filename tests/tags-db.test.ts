import "./fixtures/server-runtime";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { execFileSync } from "node:child_process";
import { after, before, describe, it } from "node:test";
import postgres from "postgres";
import { sql, type SQL } from "drizzle-orm";
import { getTableColumns } from "drizzle-orm";
import { authors, jobRuns } from "../src/db/schema";
import { normalizeSearchSql } from "../src/db/search";
import { PgDialect } from "drizzle-orm/pg-core";
import { publicMediaItemGenresJsonSql } from "../src/db/queries/media-item-genres";
import { RELATED_SERIES_ROW_LIMIT } from "../src/lib/media/related-franchises";
import { publicTagMediaItemIdsSql, publicTagMembershipSql } from "../src/db/queries/tag-membership";

// Explicit opt-in: owns a disposable container, never connects to an existing DATABASE_URL.
// TAGS_DB_TEST=1 npx tsx --test tests/tags-db.test.ts
const enabled = process.env.TAGS_DB_TEST === "1";
const container = `zadrotto-tags-test-${process.pid}`;
const dialect = new PgDialect();
const docker = (...args: string[]) => execFileSync("docker", args, { encoding: "utf8", timeout: 30_000 }).trim();
let client: ReturnType<typeof postgres>;
let started = false;
const originalDatabaseUrl = process.env.DATABASE_URL;
let appDb: typeof import("../src/db") | undefined;
let queries: typeof import("../src/db/queries/tags");

async function execute(query: SQL) {
  const compiled = dialect.sqlToQuery(query);
  return client.unsafe(compiled.sql, compiled.params as never);
}
async function publicIds(tagId: number) {
  const rows = await execute(sql`select media_item_id from (${publicTagMediaItemIdsSql(sql`${tagId}`)}) public_tags order by media_item_id`);
  return rows.map((row) => row.media_item_id);
}

// This also runs without PostgreSQL, protecting parameter binding in composed queries.
it("public tag membership preserves caller parameters", () => {
  const compiled = dialect.sqlToQuery(sql`select ${publicTagMembershipSql(sql`${17}`, sql`${23}`)} as visible`);
  assert.deepEqual(compiled.params, [17, 23]);
  assert.match(compiled.sql, /assignment\.media_item_id = \$1/);
  assert.match(compiled.sql, /assignment\.tag_id = \$2/);
});

describe("tag publication SQL", { skip: !enabled }, () => {
  before(async () => {
    docker("run", "--rm", "-d", "--name", container, "-e", "POSTGRES_PASSWORD=tags-test", "-p", "127.0.0.1::5432", "postgres:18");
    started = true;
    const port = Number(docker("port", container, "5432/tcp").split(":").at(-1));
    client = postgres({ host: "127.0.0.1", port, username: "postgres", password: "tags-test", database: "postgres", max: 4, connect_timeout: 2, onnotice() {} });
    for (let attempt = 0; ; attempt += 1) {
      try { await client`select 1`; break; }
      catch (error) {
        if (attempt >= 30) throw error;
        await new Promise((resolve) => setTimeout(resolve, 100));
      }
    }
    process.env.DATABASE_URL = `postgres://postgres:tags-test@127.0.0.1:${port}/postgres`;
    appDb = await import("../src/db");
    queries = await import("../src/db/queries/tags");
    await client.unsafe(`
      create table tags(id serial primary key,code text not null unique,title text not null);
      create table genres(id integer primary key,slug text,name text,is_active boolean,replacement_franchise_id integer,replacement_tag_id integer);
      create index genres_replacement_tag_idx on genres(replacement_tag_id);
      create table achievements(id integer primary key,params jsonb);
      create table classification_migration_runs(status text,before_snapshot jsonb,after_snapshot jsonb);
      create table authors(${Object.values(getTableColumns(authors)).map((column) => `"${column.name}" ${column.getSQLType()}`).join(",")}, primary key(id));
      create table media_items(id integer primary key,publication_status text not null);
      create table job_runs(${Object.values(getTableColumns(jobRuns)).map((column) => `"${column.name}" ${column.getSQLType()}`).join(",")});
      create table domain_events(id uuid primary key default gen_random_uuid(), type text not null,
        schema_version integer not null default 1,actor_author_id integer,aggregate_type text not null,
        aggregate_id text not null,payload jsonb not null,occurred_at timestamptz not null default now());
      create table domain_event_outbox(event_id uuid primary key references domain_events(id),
        dispatched_at timestamptz,next_attempt_at timestamptz default now(),created_at timestamptz default now(),updated_at timestamptz default now());
      create table archive_settings(id integer primary key,tag_publication_threshold integer not null);
      create table media_item_tags(media_item_id integer not null,tag_id integer not null,
        author_id integer not null references authors(id),primary key(media_item_id,tag_id,author_id));
      create index media_item_tags_tag_media_author_idx on media_item_tags(tag_id,media_item_id,author_id);
      insert into authors(id,is_system) values(1,false),(2,false),(3,false),(4,false),(5,false),(99,true),(100,true);
      insert into archive_settings values(1,3);
      insert into media_items values(60,'published'),(61,'published'),(62,'draft'),(63,'published'),(64,'published');
    `);
    await execute(sql`create unique index tags_normalized_title_unique on tags (${normalizeSearchSql(sql`title`)})`);
  });
  after(async () => {
    if (appDb) await appDb.getDbClient().end({ timeout: 2 });
    if (originalDatabaseUrl === undefined) delete process.env.DATABASE_URL;
    else process.env.DATABASE_URL = originalDatabaseUrl;
    if (client) await client.end({ timeout: 2 });
    if (started) docker("stop", container);
  });

  it("public tag guide hides private and unpublished pairs and filters enabled media types", async (t) => {
    await client`alter table media_items add column media_type text not null default 'game'`;
    await client`insert into tags(id,code,title) values(9001,'guide-public','Ёж путеводитель'),(9002,'guide-private','Личное'),(9003,'guide-draft','Черновик')`;
    assert.equal(await queries.hasPublicTags(['game']), false);
    await client`insert into media_item_tags values(60,9001,1),(60,9001,2),(60,9001,3),(61,9001,99),(60,9002,1),(62,9003,99)`;
    assert.equal(await queries.hasPublicTags(['game']), true);
    assert.equal(await queries.hasPublicTags(['book']), false);
    const input = { enabledMediaTypeCodes: ['game'], page: 1, pageSize: 24, searchQuery: '  ЕЖ  ' };
    const page = await queries.getPublicTagsPage(input);
    assert.deepEqual(page.items.map(row => [row.code, row.mediaItemsCount]), [['guide-public',2]]);
    assert.equal(page.paginationTotalCount, 1);
    assert.deepEqual((await queries.getPublicTagsPage({ ...input, enabledMediaTypeCodes: [] })).items, []);
    const appClient = appDb!.getDbClient();
    const originalUnsafe = appClient.unsafe;
    const captured: { sql: string; params: unknown[] }[] = [];
    appClient.unsafe = ((...args: Parameters<typeof originalUnsafe>) => {
      captured.push({ sql: String(args[0]), params: (args[1] ?? []) as unknown[] });
      return originalUnsafe.apply(appClient, args);
    }) as typeof originalUnsafe;
    try { await queries.hasPublicTags(['game']); await queries.getPublicTagsPage(input); }
    finally { appClient.unsafe = originalUnsafe; }
    assert.equal(captured.length, 2);
    for (const query of captured) {
      const [row] = await client.unsafe('explain(analyze,buffers,format json) '+query.sql, query.params as never);
      t.diagnostic(JSON.stringify(row['QUERY PLAN'][0]));
    }
    await client`update archive_settings set tag_publication_threshold=4 where id=1`;
    assert.equal((await queries.getPublicTagsPage(input)).items[0].mediaItemsCount, 1);
    await client`delete from media_item_tags where tag_id between 9001 and 9003`;
    assert.equal(await queries.hasPublicTags(['game']), false);
    await client`update archive_settings set tag_publication_threshold=3 where id=1`;
    await client`delete from tags where id between 9001 and 9003`;
    await client`alter table media_items drop column media_type`;
  });

  it("publishes at the threshold, deduplicates repeated assignments, and reverses on removal", async () => {
    await client`insert into media_item_tags values(1,1,1),(1,1,2)`;
    assert.deepEqual(await publicIds(1), []);
    await client`insert into media_item_tags values(1,1,2) on conflict do nothing`;
    assert.deepEqual(await publicIds(1), []);
    await client`insert into media_item_tags values(1,1,3)`;
    assert.deepEqual(await publicIds(1), [1]);
    assert.equal((await execute(sql`select ${publicTagMembershipSql(sql`1`, sql`1`)} as visible`))[0].visible, true);
    await client`delete from media_item_tags where media_item_id=1 and tag_id=1 and author_id=3`;
    assert.deepEqual(await publicIds(1), []);
    assert.equal((await execute(sql`select ${publicTagMembershipSql(sql`1`, sql`1`)} as visible`))[0].visible, false);
  });

  it("counts every record and tag pair independently and returns each public record once", async () => {
    await client`insert into media_item_tags values(10,10,1),(10,10,2),(11,10,3),(10,11,3)`;
    assert.deepEqual(await publicIds(10), []);
    assert.deepEqual(await publicIds(11), []);
    await client`insert into media_item_tags values(10,10,3),(10,10,4),(11,10,1),(11,10,2)`;
    assert.deepEqual(await publicIds(10), [10,11]);
    assert.deepEqual(await publicIds(11), []);
  });

  it("system assignment publishes immediately but never adds a community vote", async () => {
    await client`insert into tags(id,code,title) values(20,'system-test','Системный тест')`;
    await client`insert into media_item_tags values(20,20,1),(20,20,2),(20,20,99),(20,20,100)`;
    assert.deepEqual(await publicIds(20), [20]);
    assert.equal((await queries.getVisibleMediaItemTags(20, 1))[0].isEditorial, true);
    await client`delete from media_item_tags where media_item_id=20 and author_id=99`;
    assert.deepEqual(await publicIds(20), [20]);
    await client`delete from media_item_tags where media_item_id=20 and author_id=100`;
    assert.deepEqual(await publicIds(20), []);
    assert.equal((await queries.getVisibleMediaItemTags(20, 1))[0].isEditorial, false);
    await client`insert into media_item_tags values(21,20,99)`;
    assert.deepEqual(await publicIds(20), [21]);
  });

  it("shows public tags and only the current author's private assignments", async () => {
    await client`insert into tags(id,code,title) values(40,'public','A public'),(41,'mine','B mine'),(42,'theirs','C theirs'),(43,'elsewhere','D elsewhere')`;
    await client`insert into media_item_tags values(40,40,1),(40,40,2),(40,40,3),(40,41,1),(40,42,2),(41,43,1)`;
    assert.deepEqual((await queries.getVisibleMediaItemTags(40)).map((tag) => [tag.id,tag.isPublic,tag.isMine]), [[40,true,false]]);
    assert.deepEqual((await queries.getVisibleMediaItemTags(40,1)).map((tag) => [tag.id,tag.isPublic,tag.isMine]), [[40,true,true],[41,false,true]]);
    assert.deepEqual((await queries.getVisibleMediaItemTags(40,2)).map((tag) => [tag.id,tag.isPublic,tag.isMine]), [[40,true,true],[42,false,true]]);
    assert.deepEqual((await queries.getVisibleMediaItemTags(40,4)).map((tag) => tag.id), [40]);
    assert.deepEqual(await queries.getVisibleMediaItemTags(999,1), []);
    const batched = await queries.getVisibleMediaItemTagsForItems([40,999], 1);
    assert.deepEqual(batched.get(40), await queries.getVisibleMediaItemTags(40,1));
    assert.equal(batched.has(999), false);
    const guestBatch = await queries.getVisibleMediaItemTagsForItems([40]);
    assert.deepEqual(guestBatch.get(40), await queries.getVisibleMediaItemTags(40));
    assert.equal((await queries.getVisibleMediaItemTagsForItems([],1)).size, 0);
    await client`delete from media_item_tags where media_item_id=40 and tag_id=40 and author_id=3`;
    assert.deepEqual(await queries.getVisibleMediaItemTags(40), []);
    assert.deepEqual((await queries.getVisibleMediaItemTags(40,1)).map((tag) => [tag.id,tag.isPublic]), [[40,false],[41,false]]);
  });

  it("searches human titles with shared case and ё normalization", async () => {
    await client`insert into tags(id,code,title) values(50,'hedgehog','Лесной Ёж'),(51,'cat','Лесной кот')`;
    assert.deepEqual((await queries.searchTags("  ЕЖ  ")).map((tag) => tag.id), [50]);
    assert.deepEqual((await queries.searchTags("лесной")).map((tag) => tag.id), [50,51]);
    assert.deepEqual(await queries.searchTags(" \t "), []);
  });

  it("uses the current persisted threshold and defaults to three without settings", async () => {
    await client`insert into media_item_tags values(30,30,1),(30,30,2),(31,30,1),(31,30,2),(31,30,3)`;
    assert.deepEqual(await publicIds(30), [31]);
    await client`update archive_settings set tag_publication_threshold=2 where id=1`;
    assert.deepEqual(await publicIds(30), [30,31]);
    await client`update archive_settings set tag_publication_threshold=4 where id=1`;
    assert.deepEqual(await publicIds(30), []);
    await client`delete from archive_settings where id=1`;
    assert.deepEqual(await publicIds(30), [31]);
    await client`insert into archive_settings values(1,3)`;
  });
  it("mutates only the author's assignment and emits events/outbox/jobs only for real changes", async () => {
    await client`alter table media_item_tags add constraint tags_fk foreign key(tag_id) references tags(id) not valid`;
    await client`alter table media_item_tags add constraint media_fk foreign key(media_item_id) references media_items(id) not valid`;
    const first = await queries.mutateMediaItemTag({ mediaItemId: 60, authorId: 1, title: "Повторяемый тег" });
    assert.equal(first.changed, true);
    assert.deepEqual(await queries.mutateMediaItemTag({ mediaItemId: 60, authorId: 1, tagId: first.tagId }), { tagId: first.tagId, changed: false });
    await queries.mutateMediaItemTag({ mediaItemId: 60, authorId: 2, tagId: first.tagId });
    assert.equal((await queries.mutateMediaItemTag({ mediaItemId: 60, authorId: 3, tagId: first.tagId, remove: true })).changed, false);
    assert.equal((await queries.mutateMediaItemTag({ mediaItemId: 60, authorId: 1, tagId: first.tagId, remove: true })).changed, true);
    assert.equal((await queries.mutateMediaItemTag({ mediaItemId: 60, authorId: 1, tagId: first.tagId, remove: true })).changed, false);
    assert.deepEqual((await client`select author_id from media_item_tags where media_item_id=60 order by author_id`).map((row) => row.author_id), [2]);
    const events = await client`select * from domain_events order by occurred_at`;
    assert.equal(events.length, 3);
    assert.deepEqual(events.map((event) => [event.type,event.actor_author_id,event.aggregate_type,event.aggregate_id,event.payload]), [1,2,1].map((authorId) => ["media-tag.changed",authorId,"media-item","60",{ mediaItemId: 60, tagId: first.tagId }]));
    assert.equal((await client`select count(*)::int as count from domain_event_outbox`)[0].count, 3);
    assert.deepEqual((await client`select payload->>'eventId' as event_id from job_runs order by id`).map((row) => row.event_id).sort(), events.map((event) => event.id).sort());
  });

  it("editorial assignments require the system author and preserve community votes on removal", async () => {
    const personal = await queries.mutateMediaItemTag({ mediaItemId: 61, authorId: 1, title: "Редакторский тег" });
    await assert.rejects(queries.mutateMediaItemTag({ mediaItemId: 61, authorId: 1, tagId: personal.tagId, editorial: true }), /tag-forbidden/);
    await assert.rejects(queries.mutateMediaItemTag({ mediaItemId: 61, authorId: 99, tagId: personal.tagId }), /tag-forbidden/);
    await queries.mutateMediaItemTag({ mediaItemId: 61, authorId: 99, tagId: personal.tagId, editorial: true });
    assert.deepEqual(await publicIds(personal.tagId), [61]);
    await queries.mutateMediaItemTag({ mediaItemId: 61, authorId: 99, tagId: personal.tagId, editorial: true, remove: true });
    assert.deepEqual(await publicIds(personal.tagId), []);
    assert.deepEqual((await queries.getVisibleMediaItemTags(61,1)).map((tag) => [tag.id,tag.isMine]), [[personal.tagId,true]]);
    const events = await client`select actor_author_id from domain_events where aggregate_id='61' order by occurred_at`;
    assert.deepEqual(events.map((event) => event.actor_author_id), [1,null,null]);
  });

  it("rejects invalid or inactive targets without leaving tags, assignments or events", async () => {
    const before = await client`select (select count(*) from tags)::int as tags,(select count(*) from media_item_tags)::int as assignments,(select count(*) from domain_events)::int as events,(select count(*) from domain_event_outbox)::int as outbox`;
    await client`update authors set blocked_at=now() where id=3`;
    await client`update authors set merged_into_author_id=1 where id=4`;
    for (const input of [
      { mediaItemId: 999, authorId: 1, title: "Не сохранится" },
      { mediaItemId: 62, authorId: 1, title: "Черновик" },
      { mediaItemId: 63, authorId: 3, title: "Заблокирован" },
      { mediaItemId: 63, authorId: 4, title: "Объединён" },
      { mediaItemId: 63, authorId: 999, title: "Нет автора" },
      { mediaItemId: 63, authorId: 1, tagId: 999999 },
      { mediaItemId: 63, authorId: 1, title: " " },
    ]) await assert.rejects(queries.mutateMediaItemTag(input));
    assert.deepEqual(await client`select (select count(*) from tags)::int as tags,(select count(*) from media_item_tags)::int as assignments,(select count(*) from domain_events)::int as events,(select count(*) from domain_event_outbox)::int as outbox`, before);
  });

  it("rolls back the tag and assignment when transactional outbox persistence fails", async () => {
    const before = await client`select (select count(*) from tags)::int as tags,(select count(*) from media_item_tags)::int as assignments,(select count(*) from domain_events)::int as events`;
    await client`alter table domain_event_outbox add constraint reject_test_event check(false) not valid`;
    try {
      await assert.rejects(queries.mutateMediaItemTag({ mediaItemId: 64, authorId: 1, title: "Атомарность outbox" }));
    } finally {
      await client`alter table domain_event_outbox drop constraint reject_test_event`;
    }
    assert.deepEqual(await client`select (select count(*) from tags)::int as tags,(select count(*) from media_item_tags)::int as assignments,(select count(*) from domain_events)::int as events`, before);
  });

  it("concurrent normalized creation shares one tag and concurrent duplicate assignment emits once", async () => {
    const before = (await client`select count(*)::int as count from domain_events`)[0].count;
    const result = await Promise.all([
      queries.mutateMediaItemTag({ mediaItemId: 63, authorId: 1, title: "ЁЖ concurrent" }),
      queries.mutateMediaItemTag({ mediaItemId: 64, authorId: 2, title: "еж CONCURRENT" }),
    ]);
    assert.equal(result[0].tagId, result[1].tagId);
    const duplicates = await Promise.all(Array.from({ length: 6 }, () => queries.mutateMediaItemTag({ mediaItemId: 63, authorId: 2, tagId: result[0].tagId })));
    assert.equal(duplicates.filter((item) => item.changed).length, 1);
    assert.equal((await client`select count(*)::int as count from domain_events`)[0].count, before+3);
    assert.equal((await client`select count(*)::int as count from tags where id=${result[0].tagId}`)[0].count, 1);
  });

  it("genre projection hides only public tag replacements and preserves the published series branch", async () => {
    await client.unsafe(`
      create table media_item_genres(media_item_id integer,genre_id integer);
      create table franchises(id integer primary key,parent_id integer,publication_status text);
      create table media_item_franchises(media_item_id integer,franchise_id integer,publication_status text);
      insert into media_items values(70,'published');
      insert into tags values(700,'genre-replacement','Genre replacement');
      insert into genres values(1,'ordinary','Ordinary',true,null,null),(2,'tag','Tag',true,null,700),(3,'series','Series',true,1,null);
      insert into media_item_genres values(70,1),(70,2),(70,3);
      insert into franchises values(1,null,'published'),(2,1,'published');
      insert into media_item_franchises values(70,2,'published');
      insert into media_item_tags values(70,700,1),(70,700,2);`);
    const slugs = async () => (await execute(sql`select ${publicMediaItemGenresJsonSql()} as genres from media_items where id=70`))[0].genres.map((genre: { slug: string }) => genre.slug);
    assert.deepEqual(await slugs(), ['ordinary','tag']);
    await client`insert into media_item_tags values(70,700,5)`;
    assert.deepEqual(await slugs(), ['ordinary']);
    await client`delete from media_item_tags where media_item_id=70 and author_id=5`;
    assert.deepEqual(await slugs(), ['ordinary','tag']);
    await client`insert into media_item_tags values(70,700,99)`;
    assert.deepEqual(await slugs(), ['ordinary']);
    await client`delete from media_item_tags where media_item_id=70 and author_id=99`;
    await client`update media_item_franchises set publication_status='draft' where media_item_id=70`;
    assert.deepEqual(await slugs(), ['ordinary','series','tag']);
  });

  it("inspects sparse/common tag filtering, counts and actual card visibility plans", async (t) => {
    // Risk: public membership groups growing assignment sets before catalog pagination;
    // the card query repeats this membership for each candidate tag. A bounded 24k-link
    // fixture distinguishes selective index access from scans without a broad benchmark.
    await client.unsafe(`insert into media_items select id,'published' from generate_series(10000,13999) id;
      insert into tags values(900,'common-plan','Common plan'),(901,'sparse-plan','Sparse plan');
      insert into tags select id,'noise-plan-'||id,'Noise plan '||id from generate_series(1000,1099) id;
      insert into media_item_tags select id,900,a from generate_series(10000,13999) id cross join (values(1),(2),(5)) author(a);
      insert into media_item_tags select id,901,a from generate_series(10000,10009) id cross join (values(1),(2),(5)) author(a);
      insert into media_item_tags select id,1000+id%100,a from generate_series(10000,13999) id cross join (values(1),(2),(5)) author(a);
      analyze media_items; analyze media_item_tags; analyze authors; analyze tags;`);
    type Plan = Record<string, unknown> & { Plans?: Plan[] };
    const nodes = (root: Plan): Plan[] => [root,...(root.Plans ?? []).flatMap(nodes)];
    const explain = async (query: SQL) => {
      const compiled = dialect.sqlToQuery(query);
      const [row] = await client.unsafe("explain(analyze,buffers,format json) " + compiled.sql, compiled.params as never);
      return row['QUERY PLAN'][0];
    };
    for (const [tagId,expected] of [[900,4000],[901,10]]) {
      const countQuery = sql`select count(*)::int as count from media_items where publication_status='published' and id in (${publicTagMediaItemIdsSql(sql`${tagId}`)})`;
      const pageQuery = sql`select id from media_items where publication_status='published' and id in (${publicTagMediaItemIdsSql(sql`${tagId}`)}) order by id limit 24`;
      assert.equal((await execute(countQuery))[0].count, expected);
      const count = await explain(countQuery);
      const page = await explain(pageQuery);
      const access = nodes(count.Plan).filter((node) => node['Relation Name'] === 'media_item_tags');
      assert.equal(access.length, 1, 'one assignment access path per tag count');
      assert.equal(access[0]['Actual Loops'], 1, 'aggregate must not repeat per catalog record');
      if (tagId === 901) assert.match(nodes(count.Plan).map(node => [node['Index Cond'],node['Recheck Cond'],node.Filter].filter(Boolean).join(' ')).join(' '), /tag_id = 901/);
      t.diagnostic(JSON.stringify({ tagId, matchedRecords: expected, countMs: count['Execution Time'], pageMs: page['Execution Time'], assignmentAccess: access.map((node) => ({ type: node['Node Type'], rows: node['Actual Rows'], loops: node['Actual Loops'], index: node['Index Name'] })) }));
    }
    const appClient = appDb!.getDbClient();
    const originalUnsafe = appClient.unsafe;
    let captured: { sql: string; params: unknown[] } | undefined;
    appClient.unsafe = ((...args: Parameters<typeof originalUnsafe>) => {
      captured = { sql: String(args[0]), params: (args[1] ?? []) as unknown[] };
      return originalUnsafe.apply(appClient,args);
    }) as typeof originalUnsafe;
    let visible;
    try { visible = await queries.getVisibleMediaItemTags(13999); }
    finally { appClient.unsafe = originalUnsafe; }
    assert.deepEqual(visible.map((tag) => tag.id).sort((a,b) => a-b), [900,1099]);
    assert.ok(captured);
    const [row] = await client.unsafe('explain(analyze,buffers,format json) '+captured.sql,captured.params as never);
    const card = row['QUERY PLAN'][0];
    const assignments = nodes(card.Plan).filter((node) => node['Relation Name'] === 'media_item_tags');
    t.diagnostic(JSON.stringify({ cardMs: card['Execution Time'], scaledRecords: 4000, scaledAssignments: 24030, scaledTags: 102, visibleTags: visible.length, assignments: assignments.map((node) => ({ alias: node.Alias, type: node['Node Type'], rows: node['Actual Rows'], loops: node['Actual Loops'], index: node['Index Name'] })) }));
    let batchQuery: { sql: string; params: unknown[] } | undefined;
    appClient.unsafe = ((...args: Parameters<typeof originalUnsafe>) => {
      batchQuery = { sql: String(args[0]), params: (args[1] ?? []) as unknown[] };
      return originalUnsafe.apply(appClient,args);
    }) as typeof originalUnsafe;
    let batch;
    try { batch = await queries.getVisibleMediaItemTagsForItems([10000,13999],1); }
    finally { appClient.unsafe = originalUnsafe; }
    assert.deepEqual(batch.get(13999)?.map(tag => tag.id).sort((a,b) => a-b), [900,1099]);
    assert.ok(batchQuery);
    const [batchRow] = await client.unsafe('explain(analyze,buffers,format json) '+batchQuery.sql,batchQuery.params as never);
    const batchPlan = batchRow['QUERY PLAN'][0];
    t.diagnostic(JSON.stringify({ batchTagsMs: batchPlan['Execution Time'], records: batch.size, plan: batchPlan.Plan }));
    for (const access of assignments.filter((node) => String(node.Alias).startsWith('assignment'))) {
      const predicates = nodes(access).map((node) => [node['Index Cond'],node['Recheck Cond'],node.Filter].filter(Boolean).join(' ')).join(' ');
      assert.match(predicates, /media_item_id = 13999/, 'card membership stays bounded to this record');
      assert.match(predicates, /tag_id =/, 'card membership uses tag/media composite index');
    }
  });

  it("applies the generated tag migration with normalized uniqueness and relational constraints", async () => {
    await client`create extension if not exists pg_trgm`;
    await client.begin(async (tx) => {
      await tx`create schema tag_ddl_smoke`;
      await tx`set local search_path=tag_ddl_smoke,public`;
      await tx.unsafe(`create table media_items(id integer primary key); create table authors(id integer primary key);
        create table archive_settings(id integer primary key); create table genres(id integer primary key,replacement_franchise_id integer);
        insert into media_items values(1); insert into authors values(1),(2); insert into archive_settings values(1); insert into genres values(1,null);`);
      const migration = readFileSync('drizzle/0012_classification_tags.sql','utf8').replaceAll('"public".', '"tag_ddl_smoke".');
      for (const statement of migration.split('--> statement-breakpoint')) await tx.unsafe(statement);
      assert.equal((await tx`select tag_publication_threshold from archive_settings where id=1`)[0].tag_publication_threshold,3);
      const rejects = async (statement: string, code: string) => assert.rejects(tx.savepoint((sp) => sp.unsafe(statement)), (error: unknown) => error instanceof postgres.PostgresError && error.code === code);
      await tx`insert into tags(id,code,title) values(1,'hedgehog','ЁЖ  в тумане')`;
      await tx`select setval('tags_id_seq',1,true)`;
      await rejects("insert into tags(code,title) values('duplicate','еж в тумане')", '23505');
      await rejects("update archive_settings set tag_publication_threshold=0 where id=1", '23514');
      await tx`update genres set replacement_tag_id=1 where id=1`;
      await rejects("update genres set replacement_franchise_id=2 where id=1", '23514');
      await tx`insert into media_item_tags values(1,1,1),(1,1,2)`;
      await rejects("insert into media_item_tags values(1,1,1)", '23505');
      await rejects("insert into media_item_tags values(2,1,1)", '23503');
      await rejects("delete from tags where id=1", '23001');
    });
  });


  it("admin tag list paginates normalized search and handles empty or out-of-range pages", async (t) => {
    await client`insert into tags(id,code,title)
      select 8000+n,'admin-list-'||n,'Админ список '||lpad(n::text,3,'0') from generate_series(1,52) n`;
    const first = await queries.getAdminTagsPage({ searchQuery: "  АДМИН   СПИСОК  ", page: 1 });
    assert.equal(first.total, 52);
    assert.equal(first.pageSize, 25);
    assert.equal(first.totalPages, 3);
    assert.deepEqual(first.items.map(tag => tag.id), Array.from({ length: 25 }, (_, index) => 8001+index));
    const second = await queries.getAdminTagsPage({ searchQuery: "Админ список", page: 2 });
    assert.deepEqual(second.items.map(tag => tag.id), Array.from({ length: 25 }, (_, index) => 8026+index));
    const last = await queries.getAdminTagsPage({ searchQuery: "Админ список", page: 999 });
    assert.equal(last.page, 3);
    assert.deepEqual(last.items.map(tag => tag.id), [8051,8052]);
    assert.equal((await queries.getAdminTagsPage({ searchQuery: "Админ список", page: 0 })).page, 1);
    const empty = await queries.getAdminTagsPage({ searchQuery: "несуществующий-тег-списка", page: 99 });
    assert.deepEqual({ items: empty.items, total: empty.total, page: empty.page, totalPages: empty.totalPages }, { items: [], total: 0, page: 1, totalPages: 1 });

    const appClient = appDb!.getDbClient();
    const originalUnsafe = appClient.unsafe;
    const captured: { sql: string; params: unknown[] }[] = [];
    appClient.unsafe = ((...args: Parameters<typeof originalUnsafe>) => {
      captured.push({ sql: String(args[0]), params: (args[1] ?? []) as unknown[] });
      return originalUnsafe.apply(appClient, args);
    }) as typeof originalUnsafe;
    try { await queries.getAdminTagsPage({ searchQuery: "Админ список", page: 2 }); }
    finally { appClient.unsafe = originalUnsafe; }
    assert.equal(captured.length, 2, "one count and one bounded page, without per-tag queries");
    for (const query of captured) {
      const [row] = await client.unsafe("explain(analyze,buffers,format json) " + query.sql, query.params as never);
      const plan = row["QUERY PLAN"][0];
      t.diagnostic(JSON.stringify({ adminTags: plan.Plan["Node Type"], actualRows: plan.Plan["Actual Rows"], executionMs: plan["Execution Time"] }));
    }
  });

  it("deletes unused personal tag identities but preserves other assignments and dependencies", async () => {
    const create = (title: string) => queries.mutateMediaItemTag({ mediaItemId: 60, authorId: 1, title });
    const remove = (tagId: number) => queries.mutateMediaItemTag({ mediaItemId: 60, authorId: 1, tagId, remove: true });
    const exists = async (id: number) => (await client`select id from tags where id=${id}`).length > 0;
    const personal = await create('Удаляемый личный');
    await remove(personal.tagId);
    assert.equal(await exists(personal.tagId), false);
    assert.equal((await remove(personal.tagId)).changed, false);
    const shared = await create('Общий личный');
    await queries.mutateMediaItemTag({ mediaItemId: 61, authorId: 2, tagId: shared.tagId });
    await remove(shared.tagId);
    assert.equal(await exists(shared.tagId), true);
    await queries.mutateMediaItemTag({ mediaItemId: 61, authorId: 2, tagId: shared.tagId, remove: true });
    assert.equal(await exists(shared.tagId), false);
    const achievement = await create('Тег достижения');
    await client`insert into achievements values(9001,${client.json({tagId: achievement.tagId})})`;
    await remove(achievement.tagId);
    assert.equal(await exists(achievement.tagId), true);
    const genre = await create('Тег замены жанра');
    await client`insert into genres(id,replacement_tag_id) values(9001,${genre.tagId})`;
    await remove(genre.tagId);
    assert.equal(await exists(genre.tagId), true);
    const migrated = await create('Тег снимка миграции');
    await client`insert into classification_migration_runs values('applied','{}',${client.json({tags: [{id: migrated.tagId}]})})`;
    await remove(migrated.tagId);
    assert.equal(await exists(migrated.tagId), true);
    await client`delete from achievements where id=9001`;
    await client`delete from genres where id=9001`;
    await client`delete from classification_migration_runs`;
  });


  it("admin deletion rejects system tags and dependencies and deletes ordinary assignments atomically", async () => {
    const ordinary = await queries.mutateMediaItemTag({ mediaItemId: 60, authorId: 1, title: 'Админ удаление обычного' });
    await queries.mutateMediaItemTag({ mediaItemId: 60, authorId: 2, tagId: ordinary.tagId });
    await queries.mutateMediaItemTag({ mediaItemId: 61, authorId: 2, tagId: ordinary.tagId });
    const before = (await client`select count(*)::int as count from domain_events`)[0].count;
    await client.unsafe(`create function reject_admin_tag_event() returns trigger language plpgsql as $$begin raise exception 'outbox-failure'; end$$;
      create trigger reject_admin_tag_event before insert on domain_events for each row execute function reject_admin_tag_event()`);
    try {
      await assert.rejects(queries.deleteAdminTag(ordinary.tagId), (error: unknown) => error instanceof Error && error.cause instanceof Error && error.cause.message.includes("outbox-failure"));
      assert.equal((await client`select id from tags where id=${ordinary.tagId}`).length, 1);
      assert.equal((await client`select * from media_item_tags where tag_id=${ordinary.tagId}`).length, 3);
    } finally {
      await client`drop trigger reject_admin_tag_event on domain_events`;
      await client`drop function reject_admin_tag_event()`;
    }
    await queries.deleteAdminTag(ordinary.tagId);
    await queries.deleteAdminTag(ordinary.tagId);
    assert.equal((await client`select id from tags where id=${ordinary.tagId}`).length, 0);
    assert.equal((await client`select * from media_item_tags where tag_id=${ordinary.tagId}`).length, 0);
    assert.equal((await client`select count(*)::int as count from domain_events`)[0].count, before + 2);
    const system = await queries.mutateMediaItemTag({ mediaItemId: 60, authorId: 99, title: 'Админ системный тег', editorial: true });
    const page = await queries.getAdminTagsPage({ searchQuery: 'Админ системный тег', page: 1 });
    assert.equal(page.items[0].isSystem, true);
    await assert.rejects(queries.deleteAdminTag(system.tagId), /system-tag/);
    assert.equal((await client`select * from media_item_tags where tag_id=${system.tagId}`).length, 1);
    const dependency = await queries.mutateMediaItemTag({ mediaItemId: 60, authorId: 1, title: 'Админ тег зависимости' });
    await client`insert into achievements values(9002,${client.json({ tagId: dependency.tagId })})`;
    await assert.rejects(queries.deleteAdminTag(dependency.tagId), /tag-dependencies/);
    assert.equal((await client`select * from media_item_tags where tag_id=${dependency.tagId}`).length, 1);
    await client`delete from achievements where id=9002`;
  });

  it("filters admin tag status consistently for count, pages and normalized search", async (t) => {
    await client`insert into tags(id,code,title) select n,'status-'||n,'Статус тест '||n from generate_series(9500,9528) n`;
    await client`insert into media_item_tags values(60,9500,99),(61,9500,100),(60,9501,99),(60,9502,1)`;
    const input = { searchQuery: '  СТАТУС  ТЕСТ ', page: 1 };
    const system = await queries.getAdminTagsPage({ ...input, status: 'system' });
    assert.equal(system.total, 2);
    assert.deepEqual(system.items.map(row => row.id), [9500,9501]);
    const ordinary = await queries.getAdminTagsPage({ ...input, status: 'ordinary', page: 2 });
    assert.equal(ordinary.total, 27);
    assert.equal(ordinary.page, 2);
    assert.equal(ordinary.items.length, 2);
    assert.equal(ordinary.items.every(row => !row.isSystem), true);
    assert.equal((await queries.getAdminTagsPage({ ...input, status: 'all' })).total, 29);
    const appClient = appDb!.getDbClient();
    const originalUnsafe = appClient.unsafe;
    const captured: { sql: string; params: unknown[] }[] = [];
    appClient.unsafe = ((...args: Parameters<typeof originalUnsafe>) => {
      captured.push({ sql: String(args[0]), params: (args[1] ?? []) as unknown[] });
      return originalUnsafe.apply(appClient, args);
    }) as typeof originalUnsafe;
    try { await queries.getAdminTagsPage({ ...input, status: 'system' }); }
    finally { appClient.unsafe = originalUnsafe; }
    for (const query of captured) {
      const [row] = await client.unsafe('explain(analyze,buffers,format json) '+query.sql, query.params as never);
      t.diagnostic(JSON.stringify(row['QUERY PLAN'][0]));
    }
  });

  it("related tag shelves use public membership, exclude the current record and preserve independent sections", async (t) => {
    await client.unsafe(`alter table media_items add column code text, add column title text,
      add column original_title text,add column media_type text default 'game',add column media_carrier_id integer,
      add column release_year integer,add column cover_url text,add column cover_thumb_url text;
      create table media_carriers(id integer primary key,code text,name text);
      create table media_item_rating_stats(media_item_id integer primary key,score_sum integer,ratings_count integer);
      create table ratings(media_item_id integer,author_id integer,part_id integer,score integer);
      create table media_item_title_aliases(id integer,media_item_id integer,value text);
      create index related_alias_item_idx on media_item_title_aliases(media_item_id);
      insert into tags(id,code,title) values(9700,'shelf-a','Полка А'),(9701,'shelf-b','Полка Б');
      insert into media_items(id,publication_status,code,title,media_type) values
        (9700,'published','current-shelf','Current','game'),(9701,'published','public-shelf','Public','game'),
        (9702,'published','private-shelf','Private','game'),(9703,'draft','draft-shelf','Draft','game'),
        (9704,'published','book-shelf','Book','book');
      insert into media_item_tags values(9700,9700,99),(9701,9700,1),(9701,9700,2),(9701,9700,3),
        (9702,9700,1),(9703,9700,99),(9704,9700,99),(9701,9701,99);
      analyze media_items; analyze media_item_tags;`);
    const { getRelatedTagSections } = await import('../src/db/queries/media-items');
    const tags = [{ id: 9700, code: 'shelf-a', title: 'Полка А' },{ id: 9701, code: 'shelf-b', title: 'Полка Б' }];
    const input = { tags, currentMediaItemId: 9700, enabledMediaTypeCodes: ['game'] };
    const hasScaleFixture = (await client`select id from tags where id=900`).length > 0;
    const appClient = appDb!.getDbClient();
    const originalUnsafe = appClient.unsafe;
    const captured: { sql: string; params: unknown[] }[] = [];
    appClient.unsafe = ((...args: Parameters<typeof originalUnsafe>) => {
      captured.push({ sql: String(args[0]), params: (args[1] ?? []) as unknown[] });
      return originalUnsafe.apply(appClient,args);
    }) as typeof originalUnsafe;
    let sections;
    let scaledSections;
    try {
      sections = await getRelatedTagSections(input);
      if (hasScaleFixture) scaledSections = await getRelatedTagSections({ ...input, tags: [{ id: 900, code: 'common-plan', title: 'Common' }, ...tags] });
    }
    finally { appClient.unsafe = originalUnsafe; }
    assert.equal(captured.length, hasScaleFixture ? 2 : 1, 'one query per request regardless of tag count');
    if (scaledSections) assert.equal(scaledSections[0].items.length, RELATED_SERIES_ROW_LIMIT);
    assert.deepEqual(sections.map(section => [section.tag.id,section.items.map(item => item.id)]), [[9700,[9701]],[9701,[9701]]]);
    assert.equal((await getRelatedTagSections({ ...input, enabledMediaTypeCodes: [] })).length, 0);
    for (const query of captured) {
      const [planRow] = await client.unsafe('explain(analyze,buffers,format json) '+query.sql,query.params as never);
      t.diagnostic(JSON.stringify({ relatedTagsPlan: planRow['QUERY PLAN'][0] }));
    }
    await client`update archive_settings set tag_publication_threshold=4 where id=1`;
    assert.deepEqual((await getRelatedTagSections(input)).map(section => section.items.map(item => item.id)), [[],[9701]]);
  });

});
