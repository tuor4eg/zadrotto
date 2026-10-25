import assert from "node:assert/strict";
import { readFileSync, writeFileSync } from "node:fs";
import test from "node:test";
import postgres from "postgres";

const url = process.env.CREATOR_ADMIN_PAGINATION_TEST_DATABASE_URL;
test("admin creator pagination avoids unused per-row record counts and uses localized ordering index", { skip: !url }, async () => {
  const schema = `creator_admin_page_${process.pid}_${Date.now()}`;
  const scoped = new URL(url!);
  scoped.searchParams.set("options", `-c search_path=${schema},public`);
  process.env.DATABASE_URL = scoped.toString();
  const client = postgres(url!, { max: 1 });
  const { dbClient, getDb } = await import("../src/db");
  const queries = await import("../src/db/queries/creators");
  const session = (getDb() as unknown as { session: { logger: { logQuery(sql: string, params: unknown[]): void } } }).session;
  const previousLogger = session.logger;
  const captured: { sql: string; params: unknown[] }[] = [];
  session.logger = { logQuery(sql, params) { captured.push({ sql, params }); } };
  const plans: unknown[] = [];
  try {
    await client.unsafe(`CREATE EXTENSION IF NOT EXISTS pg_trgm; CREATE SCHEMA ${schema}; SET search_path=${schema},public;
      CREATE TABLE creator_types(id int PRIMARY KEY,code text UNIQUE); INSERT INTO creator_types VALUES(1,'person'),(2,'organization');
      CREATE TABLE creators(id int PRIMARY KEY,name text,name_ru text,original_name text,slug text,type_id int);
      CREATE INDEX ON creators(type_id);
      CREATE TABLE creator_roles(id int PRIMARY KEY,code text UNIQUE); INSERT INTO creator_roles VALUES(1,'writer');
      CREATE TABLE entry_creators(entry_id int,creator_id int,role_id int,PRIMARY KEY(entry_id,creator_id,role_id));
      CREATE INDEX ON entry_creators(creator_id,role_id,entry_id);
      CREATE TABLE entry_creator_pseudonyms(entry_id int PRIMARY KEY,creator_id int,role_id int);
      CREATE INDEX ON entry_creator_pseudonyms(creator_id);
      CREATE TABLE creator_relations(source_creator_id int,target_creator_id int,relation_type text,PRIMARY KEY(source_creator_id,target_creator_id,relation_type));
      CREATE INDEX ON creator_relations(target_creator_id);
      CREATE TABLE media_items(id int PRIMARY KEY,media_type text,publication_status text);
      CREATE TABLE media_types(code text PRIMARY KEY,is_publicly_available boolean); INSERT INTO media_types VALUES('book',true);
      INSERT INTO creators SELECT n,'Person '||lpad(n::text,6,'0'),CASE WHEN n%2=0 THEN 'Автор '||lpad(n::text,6,'0') END,
        'Original '||n,'creator-'||n,CASE WHEN n%10=0 THEN 2 ELSE 1 END FROM generate_series(1,100000)n;
      UPDATE creators SET name_ru='Редкое Имя' WHERE id=99998;
      INSERT INTO media_items SELECT n,'book',CASE WHEN n%10=0 THEN 'draft' ELSE 'published' END FROM generate_series(1,100000)n;
      INSERT INTO entry_creators SELECT n,1+(n+k)%100000,1 FROM generate_series(1,100000)n CROSS JOIN generate_series(0,4)k;
      INSERT INTO entry_creator_pseudonyms SELECT n,n,1 FROM generate_series(1,100000,100)n;
      INSERT INTO creator_relations SELECT n,n+1,'pseudonym_of' FROM generate_series(1,99999,100)n;
      ANALYZE creators; ANALYZE creator_types; ANALYZE media_items; ANALYZE media_types;
      ANALYZE entry_creators; ANALYZE entry_creator_pseudonyms; ANALYZE creator_relations; ANALYZE creator_roles;`);
    // Use production DDL verbatim so normalized index expressions match generated SQL.
    for (const file of ["drizzle/0140_creator_editor_search.sql", "drizzle/0141_creator_name_localization.sql"]) {
      for (const statement of readFileSync(file, "utf8").split("\n").filter(line => line.startsWith("CREATE INDEX creators_") && line.includes("_search_idx"))) {
        await client.unsafe(statement);
      }
    }
    await client.unsafe("ANALYZE creators");
    // Exact former count shape: scans media_items with correlated direct/writer membership.
    const legacy = (offset: number) => `SELECT c.id, coalesce(c.name_ru,c.name) AS name,
      (SELECT count(*)::int FROM media_items m JOIN media_types mt ON mt.code=m.media_type
       WHERE (EXISTS(SELECT 1 FROM entry_creators ec WHERE ec.entry_id=m.id AND ec.creator_id=c.id)
         OR c.id IN (
           SELECT ec.creator_id FROM entry_creators ec JOIN creator_roles r ON r.id=ec.role_id WHERE ec.entry_id=m.id AND r.code='writer'
           UNION SELECT p.creator_id FROM entry_creator_pseudonyms p JOIN creator_roles r ON r.id=p.role_id WHERE p.entry_id=m.id AND r.code='writer'
           UNION SELECT cr.target_creator_id FROM (
             SELECT ec.creator_id FROM entry_creators ec JOIN creator_roles r ON r.id=ec.role_id WHERE ec.entry_id=m.id AND r.code='writer'
             UNION SELECT p.creator_id FROM entry_creator_pseudonyms p JOIN creator_roles r ON r.id=p.role_id WHERE p.entry_id=m.id AND r.code='writer'
           ) a JOIN creator_relations cr ON cr.source_creator_id=a.creator_id AND cr.relation_type='pseudonym_of'))
         AND m.publication_status='published' AND mt.is_publicly_available) AS "mediaItemsCount"
      FROM creators c JOIN creator_types ct ON ct.id=c.type_id ORDER BY coalesce(c.name_ru,c.name),c.id LIMIT 24 OFFSET ${offset}`;
    for (const offset of [0, 23976]) {
      const statement = legacy(offset);
      const [estimated] = await client.unsafe(`EXPLAIN (FORMAT JSON) ${statement}`);
      await client.unsafe("SET statement_timeout='2s'");
      try {
        const [actual] = await client.unsafe(`EXPLAIN (ANALYZE,BUFFERS,FORMAT JSON) ${statement}`);
        plans.push({ stage: "legacy", offset, sql: statement, plan: actual["QUERY PLAN"][0] });
      } catch (error) {
        assert.equal((error as { code: string }).code, "57014");
        plans.push({ stage: "legacy", offset, sql: statement, timeoutMs: 2000, plan: estimated["QUERY PLAN"][0] });
        console.log("legacy", offset, "cancelled after 2000ms");
      } finally { await client.unsafe("SET statement_timeout=0"); }
    }
    for (const stage of ["without-order-index", "with-order-index"]) {
      if (stage === "with-order-index") {
        await client.unsafe(readFileSync("drizzle/0142_creator_admin_pagination.sql", "utf8"));
        await client.unsafe("ANALYZE creators");
      }
      for (const input of [{ page: 1 }, { page: 1000 }, { page: 4000 }, { page: 1, q: "Автор" }, { page: 1, q: "Редкое Имя" }, { page: 1, q: "Неттакогоимени" }, { page: 1000, typeCode: "person" }, { page: 1000, roleCode: "writer" }]) {
        captured.length = 0;
        const result = await queries.getCreators({ ...input, pageSize: 24 });
        assert.equal(captured.length, 2, "one count and one page query, no per-creator database calls");
        if (input.q === "Редкое Имя") assert.deepEqual(result.items.map(row => row.id), [99998]);
        else if (input.q === "Неттакогоимени") assert.equal(result.totalCount, 0);
        else assert.equal(result.items.length, 24);
        if (!input.q && !input.typeCode) assert.equal(result.totalCount, 100000);
        if (input.typeCode) assert.equal(result.totalCount, 90000);
        assert.ok(!captured[1].sql.includes("media_items"), "admin page must not compute unused record counts");
        for (const [index, query] of captured.entries()) {
          const [explained] = await client.unsafe(`EXPLAIN (ANALYZE,BUFFERS,FORMAT JSON) ${query.sql}`, query.params as string[]);
          const plan = explained["QUERY PLAN"][0];
          plans.push({ stage, input, kind: index ? "page" : "count", sql: query.sql, params: query.params, plan });
          console.log(stage, JSON.stringify(input), index ? "page" : "count", plan["Execution Time"], "ms");
          if (stage === "with-order-index" && !input.q && !input.typeCode && !input.roleCode && index === 1) {
            assert.match(JSON.stringify(plan), /creators_display_name_order_idx/);
            assert.doesNotMatch(JSON.stringify(plan), /"Node Type":"Sort"/);
          }
        }
      }
    }
    const last = await queries.getCreators({ page: 999999, pageSize: 24 });
    assert.equal(last.page, last.totalPages);
    assert.equal(last.items.length, 16);
    writeFileSync("/tmp/creator-admin-pagination-plans.json", JSON.stringify(plans, null, 2));
  } finally {
    session.logger = previousLogger;
    await dbClient.end();
    await client.unsafe(`DROP SCHEMA IF EXISTS ${schema} CASCADE`);
    await client.end();
  }
});
