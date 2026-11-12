import "./fixtures/server-runtime";
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { test } from "node:test";
import postgres from "postgres";
import { drizzle } from "drizzle-orm/postgres-js";
import { sql, type SQL } from "drizzle-orm";
import { PgDialect } from "drizzle-orm/pg-core";
import type { DbTransaction } from "../src/db/transaction";
import { lockAuthorForTransaction } from "../src/db/transaction";
import { countRatingAuthoredForMediaCodes, getAchievementMechanic, type CountMechanicParams } from "../src/lib/achievements/catalog";

const databaseUrl = process.env.ACHIEVEMENT_QUERY_TEST_DATABASE_URL;
const dialect = new PgDialect();

// Reference keeps the pre-optimization SQL, including the correlated series EXISTS.
function legacyQuery(source: "rating" | "review" | "media", params: CountMechanicParams, groupIndex: number) {
  const author = sql.raw(source === "rating" ? "ratings.author_id" : source === "review" ? "contributions.author_id" : "media_items.created_by_author_id");
  const item = sql.raw(source === "rating" ? "ratings.media_item_id" : source === "review" ? "contributions.primary_media_item_id" : "media_items.id");
  const from = source === "media" ? sql`media_items` : source === "rating"
    ? sql`ratings join media_items on media_items.id=ratings.media_item_id`
    : sql`contributions join media_items on media_items.id=contributions.primary_media_item_id`;
  return sql`select ${groupIndex}::int as "groupIndex", ${author}::int as "authorId", count(distinct ${item})::int as value
    from ${from} where ${author} in (1,2) and media_items.publication_status='published'
      and ${source === "review" ? sql`contributions.type='review' and contributions.status='published'` : sql`true`}
      and ${params.mediaType ? sql`media_items.media_type=${params.mediaType}` : sql`true`}
      and ${params.seriesId === undefined ? sql`true` : sql`exists (
        with recursive series_tree as (
          select id from franchises where id=${params.seriesId} and publication_status='published'
          union all select child.id from franchises child join series_tree parent on child.parent_id=parent.id
            where child.publication_status='published'
        ) select 1 from media_item_franchises link join series_tree on series_tree.id=link.franchise_id
          where link.media_item_id=${item} and link.publication_status='published'
      )`} group by ${author}`;
}

test("achievement count queries: scale, equivalence and merge guard concurrency", { skip: !databaseUrl, timeout: 180000 }, async t => {
  const name = `achievement_query_${process.pid}_${Date.now()}`;
  const admin = postgres(databaseUrl!, { max: 1, onnotice: () => {} });
  const url = new URL(databaseUrl!);
  url.pathname = `/${name}`;
  let client: ReturnType<typeof postgres> | undefined;
  try {
    await admin.unsafe(`create database ${name}`);
    client = postgres(url.toString(), { max: 4, onnotice: () => {} });
    const db = drizzle(client);
    const tx = db as unknown as DbTransaction;
    const execute = async (query: SQL) => {
      const compiled = dialect.sqlToQuery(query);
      return client!.unsafe(compiled.sql, compiled.params as never);
    };
    await client.unsafe(`
      create table authors(id int primary key, merged_into_author_id int);
      insert into authors values(1,null),(2,null),(3,null);
      create table media_items(id int primary key,code text,created_by_author_id int,publication_status text,media_type text);
      create index on media_items(created_by_author_id);
      create index on media_items(media_type);
      create table ratings(author_id int,media_item_id int,primary key(author_id,media_item_id));
      create table contributions(author_id int,primary_media_item_id int,type text,status text);
      create index on contributions(author_id);
      create table franchises(id int primary key,parent_id int,publication_status text);
      create index on franchises(parent_id);
      create table media_item_franchises(media_item_id int,franchise_id int,publication_status text,created_by_author_id int default 1,primary key(media_item_id,franchise_id));
      create index on media_item_franchises(franchise_id,media_item_id);
      insert into media_items select g,'item-'||g,1+g%3,case when g%19=0 then 'private' else 'published' end,'type-'||(g%5) from generate_series(1,100000)g;
      insert into ratings select 1+((g-1)/100000),1+(g-1)%100000 from generate_series(1,300000)g;
      insert into franchises select g,case when g%100=1 then null else ((g-1)/100)*100+1 end,case when g%17=0 then 'private' else 'published' end from generate_series(1,10000)g;
      insert into media_item_franchises(media_item_id,franchise_id,publication_status)
        select g,1+g%10000,case when g%23=0 then 'submitted' else 'published' end from generate_series(1,100000)g;
      insert into media_item_franchises(media_item_id,franchise_id,publication_status) values(1,3,'published');
      insert into franchises values(10001,17,'published');
      insert into media_item_franchises(media_item_id,franchise_id,publication_status) values(1,10001,'published');
      insert into contributions select 1+g%2,1+g%200,'review',case when g%7=0 then 'draft' else 'published' end from generate_series(1,1000)g;
      insert into contributions values(1,1,'note','published'),(1,null,'review','published');
      analyze media_items; analyze ratings; analyze contributions; analyze franchises; analyze media_item_franchises;
    `);
    const params: CountMechanicParams[] = [{}, { mediaType: "type-1" }, { seriesId: 1 }, { seriesId: 1, mediaType: "type-1" }, { seriesId: 17 }, { seriesId: 10001 }, { seriesId: 999999 }, { mediaType: "absent" }];
    await t.test("all count mechanics preserve publication, subtree, distinct and duplicate configuration rules", async () => {
      for (const source of ["rating", "review", "media"] as const) {
        const instances = [...params, params[1]].map((params, achievementId) => ({ achievementId, params }));
        const expectedRows = await execute(sql.join(instances.map((instance, i) => legacyQuery(source, instance.params, i)), sql` union all `));
        const expected = expectedRows.map(row => ({ achievementId: row.groupIndex, authorId: row.authorId, value: row.value }));
        const actual = await getAchievementMechanic(`${source}.authored.count`)!.evaluateBatch({ tx, authorIds: [1, 2], instances });
        const sort = (rows: typeof actual) => rows.sort((a, b) => a.achievementId - b.achievementId || a.authorId - b.authorId);
        assert.deepEqual(sort(actual), sort(expected));
      }
      const codes = ["item-1", "item-2", "item-2", "item-19", "missing"];
      const demo = await countRatingAuthoredForMediaCodes({ tx, mediaItemCodes: codes, instances: params.map((params, achievementId) => ({ achievementId, params })) });
      // Compare each demo aggregate with the old SQL using an explicit code restriction.
      for (const row of demo) {
        const reference = legacyQuery("rating", params[row.achievementId], 0);
        const compiled = dialect.sqlToQuery(reference);
        const scopedSql = compiled.sql.replace("where ratings.author_id in (1,2)", "where ratings.author_id = 1 and media_items.code in ('item-1','item-2','item-19')");
        const counts = await client!.unsafe(scopedSql, compiled.params as never);
        assert.equal(row.value, counts[0]?.value ?? 0);
      }
    });
    await t.test("25 grouped configurations share one source scan, including a narrow single configuration", async () => {
      const instances = [...Array.from({ length: 5 }, (_, i) => ({ mediaType: `type-${i}` })), ...Array.from({ length: 20 }, (_, i) => ({ seriesId: 1 + i * 100, ...(i % 2 ? { mediaType: "type-1" } : {}) }))].map((params, achievementId) => ({ achievementId, params }));
      let compiled!: ReturnType<typeof dialect.sqlToQuery>;
      const capture = { execute: async (query: SQL) => { compiled = dialect.sqlToQuery(query); return execute(query); } } as unknown as DbTransaction;
      const actual = await getAchievementMechanic("rating.authored.count")!.evaluateBatch({ tx: capture, authorIds: [1, 2], instances });
      const expectedRows = await execute(sql.join(instances.map((instance, i) => legacyQuery("rating", instance.params, i)), sql` union all `));
      const sort = (rows: typeof actual) => rows.sort((a, b) => a.achievementId - b.achievementId || a.authorId - b.authorId);
      assert.deepEqual(sort(actual), sort(expectedRows.map(row => ({ achievementId: row.groupIndex, authorId: row.authorId, value: row.value }))));
      const [row] = await client!.unsafe("explain(analyze,buffers,format json) " + compiled.sql, compiled.params as never);
      const plan = row["QUERY PLAN"][0];
      const nodes: Record<string, unknown>[] = [];
      const walk = (node: Record<string, unknown>) => { nodes.push(node); for (const child of (node.Plans ?? []) as Record<string, unknown>[]) walk(child); };
      walk(plan.Plan);
      assert.equal(nodes.filter(node => node["Relation Name"] === "ratings").length, 1);
      assert.ok(nodes.filter(node => node["Node Type"] === "Recursive Union").every(node => node["Actual Loops"] === 1));
      t.diagnostic(JSON.stringify({ records: 100000, ratings: 300000, configurations: 25, ms: plan["Execution Time"], jitMs: plan.JIT?.Timing?.Total }));
      await getAchievementMechanic("rating.authored.count")!.evaluateBatch({ tx: capture, authorIds: [1], instances: [{ achievementId: 1, params: { seriesId: 2 } }] });
      assert.doesNotMatch(compiled.sql, /materialized/);
      assert.match(compiled.sql, /select 0::int as "groupIndex"/);
    });
    await t.test("real merge write guard still serializes removal and rejects writes after merge", async () => {
      const migration = await readFile("drizzle/0005_account_merge.sql", "utf8");
      const start = migration.indexOf("CREATE FUNCTION account_merge_author_write_guard()");
      const end = migration.indexOf("END $$;", start) + "END $$;".length;
      await client!.unsafe(migration.slice(start, end));
      await client!.unsafe("create trigger account_merge_guard before insert or update or delete on media_item_franchises for each row execute function account_merge_author_write_guard('created_by_author_id')");
      let unlock!: () => void;
      const gate = new Promise<void>(resolve => { unlock = resolve; });
      let ready!: () => void;
      const acquired = new Promise<void>(resolve => { ready = resolve; });
      let workerPid = 0;
      const worker = db.transaction(async workerTx => {
        await lockAuthorForTransaction(workerTx, 1);
        workerPid = Number((await workerTx.execute(sql`select pg_backend_pid() as pid`))[0].pid);
        await workerTx.execute(sql`select id from authors where id=1 for update`);
        await getAchievementMechanic("rating.authored.count")!.evaluateBatch({ tx: workerTx, authorIds: [1], instances: [{ achievementId: 1, params: { seriesId: 1 } }] });
        ready();
        await gate;
      });
      let deletion: Promise<unknown> | undefined;
      try {
        await acquired;
        deletion = Promise.resolve(client!`delete from media_item_franchises where media_item_id=1 and franchise_id=2`);
        let blocked = false;
        for (let i = 0; i < 100 && !blocked; i++) {
          const rows = await client!`select 1 from pg_stat_activity where ${workerPid} = any(pg_blocking_pids(pid)) and wait_event='advisory'`;
          blocked = rows.length > 0;
          if (!blocked) await new Promise(resolve => setTimeout(resolve, 10));
        }
        assert.ok(blocked, "Removal must retain account merge protection during the worker transaction");
      } finally {
        unlock();
        await worker;
        await deletion;
      }
      await db.transaction(async mergeTx => {
        await lockAuthorForTransaction(mergeTx, 1);
        await mergeTx.execute(sql`update authors set merged_into_author_id=2 where id=1`);
      });
      await assert.rejects(client!`insert into media_item_franchises(media_item_id,franchise_id,publication_status,created_by_author_id) values(1,2,'published',1)`, error => (error as { code?: string }).code === "23514");
    });
  } finally {
    await client?.end({ timeout: 2 });
    await admin.unsafe(`drop database if exists ${name}`);
    await admin.end();
  }
});
