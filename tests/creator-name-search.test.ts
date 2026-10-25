import assert from "node:assert/strict";
import test from "node:test";
import { sql } from "drizzle-orm";
import { PgDialect } from "drizzle-orm/pg-core";
import { creatorDisplayNameSql, creatorNameSearchSql } from "../src/db/queries/creator-display";

const dialect = new PgDialect();
test("Creator display falls back to source; search independently normalizes all three names", () => {
  const display = dialect.sqlToQuery(creatorDisplayNameSql());
  assert.equal(display.sql, 'coalesce("creators"."name_ru", "creators"."name")');
  const search = dialect.sqlToQuery(creatorNameSearchSql("  Ёлка  "));
  assert.match(search.sql, /"creators"\."name_ru"/);
  assert.match(search.sql, /"creators"\."name"/);
  assert.match(search.sql, /"creators"\."original_name"/);
  assert.deepEqual(search.params, ["%елка%", "%елка%", "%елка%"]);
});

test("Creator names search at 100k creators with count, pagination and relationship fanout", {
  skip: !process.env.CREATOR_NAME_LOCALIZATION_TEST_DATABASE_URL,
}, async () => {
  const { default: postgres } = await import("postgres");
  const client = postgres(process.env.CREATOR_NAME_LOCALIZATION_TEST_DATABASE_URL!, { max: 1 });
  const schema = `creator_name_search_${Date.now()}`;
  try {
    await client.unsafe(`CREATE EXTENSION IF NOT EXISTS pg_trgm; CREATE SCHEMA ${schema}; SET search_path=${schema},public;
      CREATE TABLE creators(id int PRIMARY KEY,name text NOT NULL,name_ru text,original_name text);
      CREATE TABLE entry_creators(entry_id int,creator_id int,PRIMARY KEY(creator_id,entry_id));
      INSERT INTO creators SELECT n,'Creator '||n,CASE WHEN n%2=0 THEN 'Автор '||n END,'Original '||n FROM generate_series(1,100000)n;
      UPDATE creators SET name_ru='Редкое Имя' WHERE id=99998;
      INSERT INTO entry_creators SELECT n,1+(n%100000) FROM generate_series(1,500000)n;
      ANALYZE creators; ANALYZE entry_creators;`);
    const plans: unknown[] = [];
    for (const stage of ["before", "after"]) {
      if (stage === "after") {
        for (const name of ["name", "name_ru", "original_name"]) {
          await client.unsafe(`CREATE INDEX ON creators USING gin (replace(lower(regexp_replace(btrim(coalesce(${name}, '')), '\\s+', ' ', 'g')), 'ё', 'е') gin_trgm_ops)`);
        }
        await client.unsafe("ANALYZE creators");
      }
      for (const term of ["автор", "редкое имя", "неттакогоимени", "creator 12345", "original 12345"]) {
        const condition = creatorNameSearchSql(term);
        for (const [kind, statement] of [
          ["count", sql`select count(*)::int from creators where ${condition}`],
          ["page", sql`select id, ${creatorDisplayNameSql()} as name,
            (select count(*) from entry_creators ec where ec.creator_id=creators.id) as entries
            from creators where ${condition} order by ${creatorDisplayNameSql()}, id limit 25 offset 25`],
        ] as const) {
          const generated = dialect.sqlToQuery(statement);
          const [result] = await client.unsafe(`EXPLAIN (ANALYZE,BUFFERS,FORMAT JSON) ${generated.sql}`, generated.params as string[]);
          const plan = result["QUERY PLAN"][0];
          plans.push({ stage, term, kind, sql: generated.sql, params: generated.params, plan });
          console.log(stage, term, kind, plan["Execution Time"], "ms");
        }
      }
    }
    const name = dialect.sqlToQuery(sql`select ${creatorDisplayNameSql()} as name from creators where id=99998`);
    assert.equal((await client.unsafe(name.sql))[0].name, "Редкое Имя");
    const { writeFileSync } = await import("node:fs");
    writeFileSync("/tmp/creator-name-search-plans.json", JSON.stringify(plans, null, 2));
  } finally {
    await client.unsafe(`DROP SCHEMA IF EXISTS ${schema} CASCADE`);
    await client.end();
  }
});
