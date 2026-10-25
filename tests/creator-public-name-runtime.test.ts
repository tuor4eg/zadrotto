import assert from "node:assert/strict";
import { writeFileSync } from "node:fs";
import test from "node:test";
import postgres from "postgres";
import { and, eq, sql } from "drizzle-orm";

const url = process.env.CREATOR_NAME_LOCALIZATION_TEST_DATABASE_URL;
test("Public creator memberships, archive matches and localized names at representative scale", { skip: !url }, async () => {
  const schema = `creator_public_name_${Date.now()}`;
  const scoped = new URL(url!);
  scoped.searchParams.set("options", `-c search_path=${schema},public`);
  process.env.DATABASE_URL = scoped.toString();
  const client = postgres(url!, { max: 1 });
  const { db, getDb, dbClient } = await import("../src/db");
  const queries = await import("../src/db/queries/creators");
  const captured: { sql: string; params: unknown[] }[] = [];
  const session = (getDb() as unknown as { session: { logger: { logQuery(sql: string, params: unknown[]): void } } }).session;
  const previousLogger = session.logger;
  session.logger = { logQuery(sql, params) { captured.push({ sql, params }); } };
  try {
    await client.unsafe(`CREATE EXTENSION IF NOT EXISTS pg_trgm; CREATE SCHEMA ${schema}; SET search_path=${schema},public;
      CREATE TABLE creators(id int PRIMARY KEY,name text,name_ru text,original_name text,slug text,type_id int,avatar_object_key text);
      CREATE TABLE creator_types(id int PRIMARY KEY,code text); INSERT INTO creator_types VALUES(1,'person');
      CREATE TABLE creator_roles(id int PRIMARY KEY,code text,name text); INSERT INTO creator_roles VALUES(1,'writer','Автор'),(2,'director','Режиссёр');
      CREATE TABLE media_types(code text PRIMARY KEY,is_publicly_available boolean); INSERT INTO media_types VALUES('book',true),('film',true);
      CREATE TABLE media_items(id int PRIMARY KEY,media_type text,publication_status text);
      CREATE TABLE entry_creators(entry_id int,creator_id int,role_id int,PRIMARY KEY(entry_id,creator_id,role_id));
      CREATE INDEX ON entry_creators(creator_id,role_id,entry_id);
      CREATE TABLE entry_creator_pseudonyms(entry_id int,creator_id int,role_id int,PRIMARY KEY(entry_id,creator_id,role_id));
      CREATE INDEX ON entry_creator_pseudonyms(creator_id);
      CREATE TABLE creator_relations(source_creator_id int,target_creator_id int,relation_type text,PRIMARY KEY(source_creator_id,target_creator_id,relation_type));
      CREATE INDEX ON creator_relations(target_creator_id);
      INSERT INTO creators SELECT n,'Creator '||n,CASE WHEN n%2=0 THEN 'Автор '||n END,'Original '||n,'creator-'||n,1,null FROM generate_series(1,100000)n;
      UPDATE creators SET name_ru='Редкое Имя' WHERE id=99998;
      INSERT INTO media_items SELECT n,CASE WHEN n%2=0 THEN 'book' ELSE 'film' END,CASE WHEN n%10=0 THEN 'draft' ELSE 'published' END FROM generate_series(1,100000)n;
      INSERT INTO entry_creators SELECT n,1+(n+k)%100000,1+(k%2) FROM generate_series(1,100000)n CROSS JOIN generate_series(0,4)k;
      INSERT INTO entry_creator_pseudonyms SELECT n,n,1 FROM generate_series(1,100000,100)n;
      INSERT INTO creator_relations SELECT n,n+1,'pseudonym_of' FROM generate_series(1,99999,100)n;
      ANALYZE;`);
    const plans: unknown[] = [];
    const { creators, creatorTypes } = await import("../src/db/schema");
    const { creatorDisplayNameSql, creatorNameSearchSql } = await import("../src/db/queries/creator-display");
    const baseline = db.select({ id: creators.id, name: creatorDisplayNameSql(), totalCount: sql`count(*) over()` })
      .from(creators).innerJoin(creatorTypes, eq(creatorTypes.id, creators.typeId))
      .where(and(creatorNameSearchSql("автор"), sql`exists (select 1 from media_items m
        join media_types mt on mt.code=m.media_type where ${queries.creatorCondition(creators.id, sql`m.id`)}
        and m.publication_status='published' and mt.is_publicly_available and m.media_type in ('book','film'))`))
      .orderBy(creatorDisplayNameSql(), creators.id).limit(20).toSQL();
    const [baselinePlan] = await client.unsafe(`EXPLAIN (FORMAT JSON) ${baseline.sql}`, baseline.params as string[]);
    plans.push({ stage: "original-correlated-baseline", ...baseline, plan: baselinePlan["QUERY PLAN"][0],
      measurement: "Earlier ANALYZE run cancelled after more than 4 minutes 44 seconds" });

    for (const stage of ["before", "after"]) {
      if (stage === "after") {
        for (const name of ["name", "name_ru", "original_name"]) {
          await client.unsafe(`CREATE INDEX ON creators USING gin (replace(lower(regexp_replace(btrim(coalesce(${name}, '')), '\\s+', ' ', 'g')), 'ё', 'е') gin_trgm_ops)`);
        }
        await client.unsafe("ANALYZE creators");
      }
      for (const term of ["автор", "редкое имя", "неттакогоимени"]) {
        captured.length = 0;
        const page = await queries.getPublicCreatorsPage({ page: 1, pageSize: 25, searchQuery: term });
        const matches = await queries.searchArchiveCreatorMatches(term, ["book", "film"]);
        if (term === "редкое имя") {
          assert.equal(page.items[0].name, "Редкое Имя");
          assert.equal(matches.items[0].name, "Редкое Имя");
        }
        assert.equal(captured.length, 2, "one database round trip for each public API");
        for (const [index, generated] of captured.entries()) {
          const [result] = await client.unsafe(`EXPLAIN (ANALYZE,BUFFERS,FORMAT JSON) ${generated.sql}`, generated.params as string[]);
          const plan = result["QUERY PLAN"][0];
          plans.push({ stage, term, kind: index === 0 ? "public-membership-page" : "archive-matches", ...generated, plan });
          console.log(stage, term, index === 0 ? "public-page" : "archive-matches", plan["Execution Time"], "ms");
        }
      }
    }
    await client.unsafe(`INSERT INTO creators(id,name,slug,type_id) VALUES
      (100001,'Path Direct','path-direct',1),(100002,'Path Selected','path-selected',1),
      (100003,'Path Inherited','path-inherited',1),(100004,'Path Pseudonym','path-pseudonym',1),
      (100005,'Hidden Draft','hidden-draft',1),(100006,'Path AliasOne','path-alias-one',1),(100007,'Path AliasTwo','path-alias-two',1);
      INSERT INTO media_items VALUES(100001,'book','published'),(100002,'book','draft');
      INSERT INTO entry_creators VALUES(100001,100001,2),(100001,100006,1),(100002,100005,1);
      INSERT INTO entry_creator_pseudonyms VALUES(100001,100002,1),(100001,100007,1);
      INSERT INTO creator_relations VALUES(100006,100003,'pseudonym_of'),(100007,100004,'pseudonym_of');`);
    for (const name of ["Path Direct", "Path Selected", "Path Inherited", "Path Pseudonym"]) {
      const result = await queries.searchArchiveCreatorMatches(name, ["book"]);
      assert.equal(result.items[0]?.name, name, "all direct and writer pseudonym membership paths remain searchable");
      assert.equal((await queries.searchArchiveCreatorMatches(name, ["film"])).totalCount, 0);
    }
    assert.equal((await queries.searchArchiveCreatorMatches("Hidden Draft", ["book"])).totalCount, 0);
    writeFileSync("/tmp/creator-public-name-plans.json", JSON.stringify(plans, null, 2));
  } finally {
    session.logger = previousLogger;
    await dbClient.end();
    await client.unsafe(`DROP SCHEMA IF EXISTS ${schema} CASCADE`);
    await client.end();
  }
});
