import assert from "node:assert/strict";
import { readFileSync, writeFileSync } from "node:fs";
import test from "node:test";
import postgres from "postgres";
import { parseCreatorLocalizationFilter, parseCreatorProviderFilter } from "../src/lib/creators/editor";

test("localization filter accepts only supported URL values", () => {
  assert.equal(parseCreatorLocalizationFilter("ai"), "ai");
  assert.equal(parseCreatorLocalizationFilter("localized"), "localized");
  assert.equal(parseCreatorLocalizationFilter("provider"), "");
  assert.equal(parseCreatorLocalizationFilter(undefined), "");
  assert.equal(parseCreatorProviderFilter("tmdb"), "tmdb");
  assert.equal(parseCreatorProviderFilter("unexpected"), "");
});

const url = process.env.CREATOR_LOCALIZATION_FILTER_TEST_DATABASE_URL;
test("localized creator filters include real names only, combine with search/type and paginate", { skip: !url }, async () => {
  const schema = `creator_locale_filter_${process.pid}_${Date.now()}`;
  const scoped = new URL(url!);
  scoped.searchParams.set("options", `-c search_path=${schema},public`);
  process.env.DATABASE_URL = scoped.toString();
  const client = postgres(url!, { max: 1 });
  const { getDb, dbClient } = await import("../src/db");
  const { getCreators } = await import("../src/db/queries/creators");
  const session = (getDb() as unknown as { session: { logger: { logQuery(sql: string, params: unknown[]): void } } }).session;
  const previous = session.logger;
  const captured: { sql: string; params: unknown[] }[] = [];
  session.logger = { logQuery(sql, params) { captured.push({ sql, params }); } };
  const plans: unknown[] = [];
  try {
    await client.unsafe(`CREATE SCHEMA ${schema}; SET search_path=${schema},public;
      CREATE TABLE creator_types(id int PRIMARY KEY,code text UNIQUE); INSERT INTO creator_types VALUES(1,'person'),(2,'organization');
      CREATE TABLE creators(id int PRIMARY KEY,name text,name_ru text,name_ru_source text,name_ru_processed boolean,original_name text,slug text,type_id int);
      CREATE TABLE provider_creator_bindings(id serial PRIMARY KEY,creator_id int,provider text,active boolean);
      CREATE INDEX ON provider_creator_bindings(provider,creator_id) WHERE active;
      CREATE TABLE provider_creator_mappings(id serial PRIMARY KEY,creator_id int,provider text,media_type text,normalized_external_creator_name text);
      CREATE INDEX ON provider_creator_mappings(provider,media_type,normalized_external_creator_name);
      INSERT INTO provider_creator_bindings(creator_id,provider,active) VALUES (1,'tmdb',true),(1,'tmdb',true),(2,'tmdb',false),(3,'fantlab',true),(7,'tmdb',true);
      INSERT INTO provider_creator_mappings(creator_id,provider) VALUES (1,'tmdb'),(2,'google-books');
      INSERT INTO creators VALUES
        (1,'John','Джон','ai',true,null,'john',1),
        (2,'Jane','Джейн','manual',true,null,'jane',1),
        (3,'Jack','Джек','provider',true,null,'jack',1),
        (4,'Bob',null,'ai',true,null,'bob',1),
        (5,'Иван',null,null,true,null,'ivan',1),
        (6,'Empty',null,'manual',true,null,'empty',1),
        (7,'Company','Компания','ai',true,null,'company',2);`);
    const localized = await getCreators({ localization: "localized", pageSize: 2 });
    assert.equal(localized.totalCount, 4);
    assert.ok(localized.items.every(row => typeof row.sourceName === "string"));
    assert.equal(localized.totalPages, 2);
    const second = await getCreators({ localization: "localized", pageSize: 2, page: 2 });
    assert.equal(new Set([...localized.items, ...second.items].map(row => row.id)).size, 4);
    assert.deepEqual((await getCreators({ localization: "ai" })).items.map(row => row.id).sort(), [1, 7]);
    assert.deepEqual((await getCreators({ localization: "ai", typeCode: "person", q: "Джон" })).items.map(row => row.id), [1]);
    assert.equal((await getCreators({ localization: "ai", q: "Jane" })).totalCount, 0);
    assert.equal((await getCreators()).totalCount, 7);
    assert.deepEqual((await getCreators({ provider: "tmdb" })).items.map(row => row.id).sort(), [1, 7], "duplicate bindings/mapping must not duplicate rows; inactive bindings excluded");
    assert.deepEqual((await getCreators({ provider: "google-books" })).items.map(row => row.id), [2], "name mappings also identify providers");
    assert.deepEqual((await getCreators({ provider: "tmdb", localization: "ai", typeCode: "person", q: "Джон" })).items.map(row => row.id), [1]);
    await client.unsafe(`INSERT INTO creators SELECT n,'Person '||n,
      CASE WHEN n%2=0 THEN 'Автор '||n END,
      CASE WHEN n%6=0 THEN 'ai' WHEN n%2=0 THEN 'provider' END,true,null,'person-'||n,1
      FROM generate_series(100,100099)n;`);
    await client.unsafe(readFileSync("drizzle/0142_creator_admin_pagination.sql", "utf8"));
    await client.unsafe(`INSERT INTO provider_creator_bindings(creator_id,provider,active)
      SELECT n,CASE WHEN n%2=0 THEN 'bgg' ELSE 'fantlab' END,true FROM generate_series(100,100099)n CROSS JOIN generate_series(1,2)copy;
      INSERT INTO provider_creator_mappings(creator_id,provider,media_type,normalized_external_creator_name)
      SELECT n,'fantlab','book','person-'||n FROM generate_series(100,100099)n;
      ANALYZE creators; ANALYZE creator_types; ANALYZE provider_creator_bindings; ANALYZE provider_creator_mappings;`);
    for (const provider of ["bgg", "tmdb", "rawg"] as const) {
      captured.length = 0;
      const result = await getCreators({ provider, page: 1000, pageSize: 24 });
      assert.equal(captured.length, 2);
      if (provider === "rawg") assert.equal(result.totalCount, 0);
      for (const [index, query] of captured.entries()) {
        const [explain] = await client.unsafe(`EXPLAIN (ANALYZE,BUFFERS,FORMAT JSON) ${query.sql}`, query.params as string[]);
        const plan = explain["QUERY PLAN"][0];
        console.log(provider, index ? "page" : "count", plan["Execution Time"], "ms");
        plans.push({ provider, kind: index ? "page" : "count", ...query, plan });
      }
    }
    for (const phase of ["common", "rare", "absent"]) {
      if (phase === "rare") await client.unsafe("UPDATE creators SET name_ru_source='provider' WHERE name_ru_source='ai' AND id>1; ANALYZE creators");
      if (phase === "absent") await client.unsafe("UPDATE creators SET name_ru_source='provider' WHERE name_ru_source='ai'; ANALYZE creators");
      for (const localization of ["localized", "ai"] as const) {
        captured.length = 0;
        const result = await getCreators({ localization, page: 1000, pageSize: 24 });
        assert.equal(captured.length, 2);
        if (phase === "rare" && localization === "ai") assert.equal(result.totalCount, 1);
        if (phase === "absent" && localization === "ai") assert.equal(result.totalCount, 0);
        for (const [index, query] of captured.entries()) {
          const [explain] = await client.unsafe(`EXPLAIN (ANALYZE,BUFFERS,FORMAT JSON) ${query.sql}`, query.params as string[]);
          const plan = explain["QUERY PLAN"][0];
          console.log(phase, localization, index ? "page" : "count", plan["Execution Time"], "ms");
          plans.push({ phase, localization, kind: index ? "page" : "count", ...query, plan });
        }
      }
    }
    writeFileSync("/tmp/creator-localization-filter-plans.json", JSON.stringify(plans, null, 2));
  } finally {
    session.logger = previous;
    await dbClient.end();
    await client.unsafe(`DROP SCHEMA IF EXISTS ${schema} CASCADE`);
    await client.end();
  }
});
