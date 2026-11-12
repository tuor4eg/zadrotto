import assert from "node:assert/strict";
import test from "node:test";
import postgres from "postgres";
import { sql } from "drizzle-orm";
import { PgDialect } from "drizzle-orm/pg-core";
import { publishedSeriesMembershipSql, publishedSeriesMediaItemIdsSql } from "../src/db/queries/series-membership";

const databaseUrl = process.env.SERIES_FILTER_TEST_DATABASE_URL;

test("series catalog set filter preserves results at 100k records", { skip: !databaseUrl }, async t => {
  // Session-local temporary tables shadow application tables; no application data is changed.
  const client = postgres(databaseUrl!, { max: 1 });
  try {
    await client`create temp table franchises(id int primary key, parent_id int, publication_status text)`;
    await client`create index on franchises(parent_id)`;
    await client`create temp table media_items(id int primary key, media_type text, publication_status text, release_year int)`;
    await client`create temp table media_item_franchises(media_item_id int, franchise_id int, publication_status text, primary key(media_item_id,franchise_id))`;
    await client`create index on media_item_franchises(franchise_id,media_item_id)`;
    await client`insert into franchises select g,
      case when g%100=1 then null else ((g-1)/100)*100+1 end,
      case when g%17=0 then 'private' else 'published' end from generate_series(1,10000)g`;
    await client`insert into media_items select g, case when g%3=0 then 'film' else 'game' end,
      case when g%19=0 then 'private' else 'published' end, 1980+g%45 from generate_series(1,100000)g`;
    await client`insert into media_item_franchises select g, 1+g%10000,
      case when g%23=0 then 'submitted' else 'published' end from generate_series(1,100000)g`;
    // A record linked to two descendants must still count once.
    await client`insert into media_item_franchises values (1,3,'published')`;
    await client`analyze franchises`;
    await client`analyze media_items`;
    await client`analyze media_item_franchises`;
    const dialect = new PgDialect();
    for (const rootId of [1, 2, -1, 17]) {
      const oldCondition = publishedSeriesMembershipSql(sql`media_items.id`, sql`${rootId}`);
      const newCondition = sql`media_items.id in (${publishedSeriesMediaItemIdsSql(sql`${rootId}`)})`;
      for (const shape of ["types", "list"] as const) {
        let expected: unknown;
        for (const [label, condition] of [["old", oldCondition], ["new", newCondition]] as const) {
          const query = dialect.sqlToQuery(shape === "types"
            ? sql`select media_type,count(*) from media_items where publication_status='published'
                and ${condition} group by media_type order by media_type`
            : sql`select id,release_year from media_items where publication_status='published'
                and ${condition} order by release_year asc nulls last,id limit 24 offset 24`);
          const rows = Array.from(await client.unsafe(query.sql, query.params as never));
          if (label === "old") expected = rows;
          else assert.deepEqual(rows, expected, `${shape}: root ${rootId}`);
          if (rootId === 1) {
            const [row] = await client.unsafe("explain(analyze,buffers,format json) " + query.sql, query.params as never);
            const plan = row["QUERY PLAN"][0];
            t.diagnostic(JSON.stringify({ label, shape, ms: plan["Execution Time"], jit: plan.JIT?.Timing?.Total }));
          }
        }
      }
    }
  } finally {
    await client.end();
  }
});
