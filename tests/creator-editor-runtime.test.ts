import assert from "node:assert/strict";
import { readFileSync, writeFileSync } from "node:fs";
import test from "node:test";
import postgres from "postgres";

const url = process.env.CREATOR_EDITOR_TEST_DATABASE_URL;
test("Creator editor validates type changes and organization dates, loads targeted state and bounded search", { skip: !url }, async () => {
  const schema = `creator_editor_${Date.now()}`;
  const client = postgres(url!, { max: 1 });
  const scoped = new URL(url!);
  scoped.searchParams.set("options", `-c search_path=${schema},public`);
  process.env.DATABASE_URL = scoped.toString();
  const { dbClient } = await import("../src/db");
  const queries = await import("../src/db/queries/creators");
  const avatars = await import("../src/db/queries/creator-avatars");
  const search = await import("../src/db/queries/creator-editor");
  try {
    await client.unsafe(`CREATE EXTENSION IF NOT EXISTS pg_trgm WITH SCHEMA public; CREATE SCHEMA ${schema}; SET search_path=${schema},public;
      CREATE TABLE creator_types(id int PRIMARY KEY,code text,name text,created_at timestamptz DEFAULT now(),updated_at timestamptz DEFAULT now());
      INSERT INTO creator_types(id,code,name) VALUES(1,'person','Человек'),(2,'organization','Организация'),(3,'collective','Коллектив');
      CREATE TABLE creators(id serial PRIMARY KEY,name text,original_name text,slug text,type_id int,
        birth_date date,death_date date,avatar_object_key text,avatar_source text,avatar_source_external_id text,
        avatar_source_url text,avatar_original_url text,avatar_fetched_at timestamptz,avatar_content_hash text,
        avatar_version int DEFAULT 0,created_at timestamptz DEFAULT now(),updated_at timestamptz DEFAULT now(),name_ru text,name_ru_source text,name_ru_processed boolean default false);
      CREATE TABLE provider_creator_bindings(id serial PRIMARY KEY,provider text,external_creator_id text,creator_id int,active boolean DEFAULT true,external_creator_name text,created_at timestamptz DEFAULT now(),updated_at timestamptz DEFAULT now());
      CREATE INDEX ON provider_creator_bindings(creator_id);
      CREATE TABLE provider_creator_mappings(id serial PRIMARY KEY,provider text,media_type text,external_creator_name text,normalized_external_creator_name text,creator_id int,binding_id int,created_at timestamptz DEFAULT now(),updated_at timestamptz DEFAULT now());
      CREATE INDEX ON provider_creator_mappings(creator_id);
      CREATE TABLE creator_relations(source_creator_id int,target_creator_id int,relation_type text,PRIMARY KEY(source_creator_id,target_creator_id,relation_type));
      CREATE INDEX ON creator_relations(target_creator_id);
      CREATE TABLE creator_series(creator_id int,series_id int,PRIMARY KEY(creator_id,series_id));
      CREATE TABLE creator_roles(id int PRIMARY KEY,code text,name text);
      INSERT INTO creator_roles VALUES(1,'director','Режиссёр');
      CREATE TABLE entry_creators(entry_id int,creator_id int,role_id int,is_manual boolean DEFAULT false);
      CREATE INDEX ON entry_creators(creator_id,role_id,entry_id);
      CREATE TABLE entry_creator_pseudonyms(entry_id int,creator_id int,role_id int);
      CREATE INDEX ON entry_creator_pseudonyms(creator_id);
      CREATE TABLE franchises(id int PRIMARY KEY,code text,title text);
      CREATE TABLE job_runs(id serial PRIMARY KEY,job_id int,retry_of_run_id int,created_by_admin_id int,type text,payload jsonb,source text,status text DEFAULT 'queued',scheduled_for timestamptz,available_at timestamptz,attempts int DEFAULT 0,max_attempts int,timeout_seconds int,retry_base_seconds int,retry_max_seconds int,locked_at timestamptz,locked_by text,lock_token text,lock_expires_at timestamptz,started_at timestamptz,finished_at timestamptz,cancelled_at timestamptz,error_code text,error_message text,created_at timestamptz DEFAULT now(),updated_at timestamptz DEFAULT now());
      SELECT setval(pg_get_serial_sequence('creators','id'),100);

      INSERT INTO creators(id,name,slug,type_id) VALUES(1,'Человек','person',1),(2,'Компания','company',2),(3,'Псевдоним','alias',1),(4,'Коллектив','collective',3);
      INSERT INTO creator_relations VALUES(3,1,'pseudonym_of');
    `);
    await assert.rejects(avatars.assignFantlabCreatorBinding({ creatorId: 2, externalCreatorId: "30" }), /FantLab ID/);
    await queries.updateCreator(2, { name: "Компания", slug: "company", typeId: 2, birthDate: "2000-02-29", deathDate: "2020-01-01" });
    assert.equal((await queries.getAdminCreatorById(2))?.birthDate, "2000-02-29");
    await assert.rejects(queries.updateCreator(2, { name: "Компания", slug: "company", typeId: 2, birthDate: "2021-02-29" }));
    await assert.rejects(queries.updateCreator(2, { name: "Компания", slug: "company", typeId: 2, deathDate: "1999-01-01" }));
    await assert.rejects(queries.updateCreator(3, { name: "Псевдоним", slug: "alias", typeId: 1, birthDate: "2000-01-01" }));
    await client`INSERT INTO provider_creator_bindings(provider,external_creator_id,creator_id) VALUES('tmdb','person:10',1)`;
    await assert.rejects(queries.updateCreator(1, { name: "Человек", slug: "person", typeId: 2 }), /creator-type-in-use/);
    await client`INSERT INTO provider_creator_bindings(provider,external_creator_id,creator_id,active) VALUES('tmdb','person:11',1,false)`;
    assert.equal((await queries.getCreatorProviderBindings(1)).length, 1);
    assert.equal((await queries.getCreatorProviderBindings(1, true)).length, 2);
    const person = await queries.getAdminCreatorById(1);
    assert.equal(person?.incomingRelations[0].name, "Псевдоним");
    await queries.updateCreator(4, { name: "Организация", slug: "collective", typeId: 2, birthDate: "2001-01-01" });
    await client`INSERT INTO entry_creators VALUES(10,4,1,false)`;
    await assert.rejects(queries.updateCreator(4, { name: "Организация", slug: "collective", typeId: 1 }), /creator-type-in-use/);
    assert.deepEqual((await queries.getAdminCreatorById(4))?.roles.map(r => r.code), ["director"]);
    assert.deepEqual(await search.findCreatorRelationCandidates("Че"), { items: [], hasMore: false });
    assert.equal((await search.findCreatorRelationCandidates("человек")).items[0].id, 1);
    assert.equal((await search.findCreatorRelationCandidates("человек", 1)).items.length, 0);
    assert.equal((await search.findCreatorRelationCandidates("компания")).items.length, 0);

    const localized = await queries.createCreator({ name: "John Smith", nameRu: "Джон Смит", slug: "john-smith", typeId: 1 });
    assert.deepEqual([localized.nameRu, localized.nameRuSource, localized.nameRuProcessed], ["Джон Смит", "manual", true]);
    const changed = await queries.updateCreator(localized.id, { name: "John Smith", nameRu: "Джон", slug: "john-smith", typeId: 1 });
    assert.deepEqual([changed.nameRu, changed.nameRuSource, changed.nameRuProcessed], ["Джон", "manual", true]);
    const unchanged = await queries.updateCreator(localized.id, { name: "John Smith", slug: "john-smith", typeId: 1 });
    assert.equal(unchanged.nameRuSource, "manual");
    assert.equal(unchanged.nameRu, "Джон");
    const cleared = await queries.updateCreator(localized.id, { name: "John Smith", nameRu: null, slug: "john-smith", typeId: 1 });
    assert.deepEqual([cleared.nameRu, cleared.nameRuSource, cleared.nameRuProcessed], [null, "manual", true]);
    const renamedManual = await queries.updateCreator(localized.id, { name: "John Doe", slug: "john-smith", typeId: 1 });
    assert.deepEqual([renamedManual.nameRu, renamedManual.nameRuSource, renamedManual.nameRuProcessed], [null, "manual", true]);
    const cyrillic = await queries.createCreator({ name: "Иван", slug: "ivan", typeId: 1 });
    assert.equal(cyrillic.nameRuProcessed, true);
    const renamed = await queries.updateCreator(cyrillic.id, { name: "Ivan", slug: "ivan", typeId: 1 });
    assert.deepEqual([renamed.nameRu, renamed.nameRuSource, renamed.nameRuProcessed], [null, null, false]);

    if (process.env.CREATOR_EDITOR_PERF === "1") {
      await client`DELETE FROM creators WHERE id>=100`;
      await client.unsafe(`INSERT INTO creators(id,name,original_name,slug,type_id)
        SELECT n,'Creator '||n,'Original '||n,'creator-'||n,CASE WHEN n%10=0 THEN 2 ELSE 1 END FROM generate_series(5,200000)n;
        UPDATE creators SET name='Редкое Имя' WHERE id=199999;
        INSERT INTO provider_creator_mappings(provider,media_type,external_creator_name,normalized_external_creator_name,creator_id)
          SELECT 'tmdb','film','Creator '||n,'creator '||n,1+n%200000 FROM generate_series(1,1000000)n;
        INSERT INTO provider_creator_bindings(provider,external_creator_id,creator_id)
          SELECT 'tmdb','person:'||n,1+n%200000 FROM generate_series(100,200099)n;
        INSERT INTO entry_creators SELECT n,1+n%200000,1,false FROM generate_series(1,1000000)n;
        ANALYZE creators; ANALYZE creator_types; ANALYZE provider_creator_mappings;
        ANALYZE provider_creator_bindings; ANALYZE entry_creators; ANALYZE creator_relations; ANALYZE creator_series;`);
      const plans: unknown[] = [];
      for (const stage of ["before", "after"]) {
        if (stage === "after") {
          for (const statement of readFileSync("drizzle/0140_creator_editor_search.sql", "utf8").split("--> statement-breakpoint")) await client.unsafe(statement);
          await client.unsafe("ANALYZE creators");
        }
        for (const query of ["creator", "редкое имя", "неттакогоимени"]) {
          const generated = search.creatorRelationCandidatesQuery(query, 42).toSQL();
          const [plan] = await client.unsafe(`EXPLAIN (ANALYZE,BUFFERS,FORMAT JSON) ${generated.sql}`, generated.params as string[]);
          const details = plan["QUERY PLAN"][0];
          plans.push({ stage, query, sql: generated.sql, params: generated.params, plan: details });
          console.log(stage, query, details["Execution Time"], "ms");
        }
      }
      for (const [name, statement] of [
        ["old-card", "SELECT id,name,original_name,slug,type_id FROM creators ORDER BY name"],
        ["old-mappings", "SELECT * FROM provider_creator_mappings"],
        ["card", "SELECT c.id,c.name,c.original_name,c.slug,c.type_id,t.code FROM creators c JOIN creator_types t ON t.id=c.type_id WHERE c.id=99999"],
        ["card-pseudonym-assignment", "SELECT c.id,EXISTS(SELECT 1 FROM entry_creator_pseudonyms p WHERE p.creator_id=c.id) FROM creators c WHERE c.id=99999"],
        ["binding-owner-type", "SELECT c.id,t.code FROM creators c JOIN creator_types t ON t.id=c.type_id WHERE c.id=99999 FOR UPDATE OF c"],
        ["bindings-history", "SELECT * FROM provider_creator_bindings WHERE creator_id=99999 ORDER BY provider,external_creator_id"],
        ["mappings", "SELECT * FROM provider_creator_mappings WHERE creator_id=99999 ORDER BY provider,external_creator_name"],
        ["roles", "SELECT DISTINCT r.code,r.name FROM entry_creators e JOIN creator_roles r ON r.id=e.role_id WHERE e.creator_id=99999"],
        ["direct-series", "SELECT series_id FROM creator_series WHERE creator_id=99999"],
        ["relations", "SELECT r.target_creator_id,c.name FROM creator_relations r JOIN creators c ON c.id=r.target_creator_id WHERE r.source_creator_id=99999"],
        ["incoming", "SELECT r.source_creator_id,c.name FROM creator_relations r JOIN creators c ON c.id=r.source_creator_id WHERE r.target_creator_id=99999"],
        ["type-guard", `SELECT (EXISTS(SELECT 1 FROM provider_creator_bindings WHERE creator_id=99999 AND active)
          OR EXISTS(SELECT 1 FROM provider_creator_mappings WHERE creator_id=99999)
          OR EXISTS(SELECT 1 FROM entry_creators WHERE creator_id=99999)
          OR EXISTS(SELECT 1 FROM creator_relations WHERE source_creator_id=99999)
          OR EXISTS(SELECT 1 FROM creator_relations WHERE target_creator_id=99999)
          OR EXISTS(SELECT 1 FROM entry_creator_pseudonyms WHERE creator_id=99999)) AS blocked`],
      ]) {
        const [plan] = await client.unsafe(`EXPLAIN (ANALYZE,BUFFERS,FORMAT JSON) ${statement}`);
        plans.push({ name, sql: statement, plan: plan["QUERY PLAN"][0] });
        console.log(name, plan["QUERY PLAN"][0]["Execution Time"], "ms");
      }
      writeFileSync("/tmp/creator-editor-plans.json", JSON.stringify(plans, null, 2));
    }
  } finally {
    await dbClient.end();
    await client.unsafe(`DROP SCHEMA ${schema} CASCADE`);
    await client.end();
  }
});
