import assert from "node:assert/strict";
import { test } from "node:test";

const url = process.env.CREATOR_ROLE_COUNTS_TEST_DATABASE_URL;
test("public media role counts and filters count creators, not records", { skip: !url }, async () => {
  const postgres = (await import("postgres")).default;
  const admin = postgres(url!, { max: 1, prepare: false });
  const schema = `creator_roles_${Date.now()}`;
  const scoped = new URL(url!);
  scoped.searchParams.set("options", `-c search_path=${schema},public`);
  process.env.DATABASE_URL = scoped.toString();
  const { dbClient, getDb } = await import("../src/db");
  const { getPublicCreatorMediaTypeTabs, getPublicCreatorsPage } = await import("../src/db/queries/creators");
  try {
    await admin.unsafe(`create schema ${schema}; set search_path=${schema},public;
      create table media_types(code text primary key,name text,is_publicly_available boolean);
      create table media_items(id int primary key,media_type text,publication_status text);
      create table creator_types(id int primary key,code text);
      create table creators(id int primary key,name text,name_ru text,original_name text,slug text,avatar_object_key text,type_id int);
      create table creator_roles(id int primary key,code text,name text);
      create table entry_creators(entry_id int,creator_id int,role_id int);
      create table entry_creator_pseudonyms(entry_id int,creator_id int,role_id int);
      create table creator_relations(source_creator_id int,target_creator_id int,relation_type text);
      insert into media_types values ('comic','Комиксы',true),('book','Книги',true),('hidden','Скрытый',false);
      insert into media_items values (1,'comic','published'),(2,'comic','published'),(3,'comic','draft'),(4,'book','published'),(5,'hidden','published');
      insert into creator_types values (1,'person');
      insert into creators values (1,'Alice',null,null,'alice',null,1),(2,'Bob',null,null,'bob',null,1),(3,'Carol',null,null,'carol',null,1),(4,'Alias',null,null,'alias',null,1);
      insert into creator_roles values (1,'screenwriter','Сценарист'),(2,'artist','Художник'),(3,'writer','Писатель');
      insert into entry_creators values (1,1,1),(2,1,1),(1,1,2),(2,2,2),(3,3,1),(5,3,1),(4,4,3);
      insert into creator_relations values (4,3,'pseudonym_of');`);
    const tabs = await getPublicCreatorMediaTypeTabs();
    const comic = tabs.find(tab => tab.code === "comic")!;
    assert.equal(comic.creatorsCount, 2);
    assert.equal(comic.roles.find(role => role.code === "screenwriter")?.creatorsCount, 1);
    assert.equal(comic.roles.find(role => role.code === "artist")?.creatorsCount, 2);
    assert.equal(tabs.some(tab => tab.code === "hidden"), false);
    const book = tabs.find(tab => tab.code === "book")!;
    assert.equal(book.roles.find(role => role.code === "writer")?.creatorsCount, 2);
    const page = await getPublicCreatorsPage({ mediaType: "comic", roles: ["screenwriter"], searchQuery: "", page: 1, pageSize: 24 });
    assert.deepEqual(page.items.map(item => item.name), ["Alice"]);
    assert.equal(page.items[0].mediaItemsCount, 2);
    const combined = await getPublicCreatorsPage({ mediaType: "comic", roles: ["screenwriter", "artist"], searchQuery: "", page: 1, pageSize: 24 });
    assert.deepEqual(combined.items.map(item => item.name), ["Alice", "Bob"]);
    if (process.env.CREATOR_ROLE_COUNTS_PERF_TEST === "1") {
      await admin.unsafe(`create index on entry_creators(entry_id,creator_id,role_id);
        create index on entry_creators(creator_id,role_id,entry_id);
        create index on creator_relations(source_creator_id,target_creator_id);
        insert into media_items select 100+n,case when n%2=0 then 'comic' else 'book' end,'published' from generate_series(1,10000) n;
        insert into creators select 100+n,'Creator '||n,null,null,'scale-'||n,null,1 from generate_series(1,10000) n;
        insert into entry_creators select 100+n,101+(n+k)%10000,1+(k%3) from generate_series(1,10000) n cross join generate_series(0,4) k;
        analyze;`);
      const session = (getDb() as unknown as { session: { logger: { logQuery(sql: string, params: unknown[]): void } } }).session;
      const previousLogger = session.logger;
      let query: { sql: string; params: unknown[] } | undefined;
      session.logger = { logQuery(sql, params) { query = { sql, params }; } };
      try { await getPublicCreatorMediaTypeTabs(); } finally { session.logger = previousLogger; }
      assert.ok(query);
      const [result] = await admin.unsafe(`EXPLAIN (ANALYZE, BUFFERS, FORMAT JSON) ${query.sql}`, query.params as string[]);
      const plan = result["QUERY PLAN"][0];
      const nodes: string[] = [];
      const collect = (node: { "Node Type": string; Plans?: unknown[] }) => { nodes.push(node["Node Type"]); for (const child of node.Plans ?? []) collect(child as typeof node); };
      collect(plan.Plan);
      console.log(JSON.stringify({ records: 10000, creators: 10000, memberships: 50000, executionMs: plan["Execution Time"], sharedHitBlocks: plan.Plan["Shared Hit Blocks"], nodes }));
    }
  } finally {
    await dbClient.end();
    await admin.unsafe(`drop schema ${schema} cascade`);
    await admin.end();
  }
});
