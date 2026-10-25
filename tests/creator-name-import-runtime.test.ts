import assert from "node:assert/strict";
import test from "node:test";
import postgres from "postgres";

const testUrl = process.env.CREATOR_LOCALIZATION_TEST_DATABASE_URL;
test("provider names respect stored priorities, including manual null, and locked rechecks", { skip: !testUrl }, async () => {
  const schema = `creator_import_${process.pid}_${Date.now()}`;
  const url = new URL(testUrl!);
  url.searchParams.set("options", `-c search_path=${schema}`);
  process.env.DATABASE_URL = url.toString();
  const sql = postgres(testUrl!, { max: 1 });
  const { db, dbClient } = await import("../src/db");
  const { applyProviderCreatorName } = await import("../src/db/queries/creator-name-import");
  try {
    await sql.unsafe(`CREATE SCHEMA ${schema}; SET search_path=${schema};
      CREATE TABLE creators(id int PRIMARY KEY,name text,name_ru text,name_ru_source text,name_ru_processed boolean DEFAULT false,updated_at timestamptz DEFAULT now());
      INSERT INTO creators(id,name,name_ru,name_ru_source) VALUES
        (1,'John',NULL,NULL),(2,'John','Джон','ai'),(3,'John','Ручное','manual'),(4,'John',NULL,'manual'),(5,'John','Провайдер','provider');`);
    for (const id of [1, 2, 3, 4, 5]) await db.transaction(tx => applyProviderCreatorName(tx, id, "Джон Смит"));
    const rows = await sql`SELECT id,name_ru,name_ru_source,name_ru_processed FROM creators ORDER BY id`;
    assert.deepEqual(rows.map(row => [row.name_ru,row.name_ru_source]), [["Джон Смит","provider"],["Джон Смит","provider"],["Ручное","manual"],[null,"manual"],["Провайдер","provider"]]);
    assert.equal(rows[0].name_ru_processed, true);
    await db.transaction(tx => applyProviderCreatorName(tx, 1, "Другое имя"));
    assert.equal((await sql`SELECT name_ru FROM creators WHERE id=1`)[0].name_ru, "Джон Смит");
    await sql`UPDATE creators SET name_ru=null,name_ru_source=null,name_ru_processed=false WHERE id=1`;
    await db.transaction(tx => applyProviderCreatorName(tx, 1, "John Smith"));
    await db.transaction(tx => applyProviderCreatorName(tx, 1, "Я".repeat(201)));
    assert.equal((await sql`SELECT name_ru FROM creators WHERE id=1`)[0].name_ru, null);
    // Provider update starts while a manual editor owns the row. It must re-read after waiting.
    let release!: () => void;
    let locked!: () => void;
    const acquired = new Promise<void>(resolve => { locked = resolve; });
    const gate = new Promise<void>(resolve => { release = resolve; });
    const manual = sql.begin(async tx => {
      await tx`UPDATE creators SET name_ru=null,name_ru_source='manual',name_ru_processed=true WHERE id=1`;
      locked();
      await gate;
    });
    await acquired;
    const provider = db.transaction(tx => applyProviderCreatorName(tx, 1, "Автоматическое"));
    release();
    await Promise.all([manual, provider]);
    assert.deepEqual((await sql`SELECT name_ru,name_ru_source,name_ru_processed FROM creators WHERE id=1`)[0], { name_ru: null, name_ru_source: "manual", name_ru_processed: true });
    if (process.env.CREATOR_LOCALIZATION_TEST_SCALE === "1") {
      await sql`INSERT INTO creators(id,name) SELECT n,'Person '||n FROM generate_series(100,100099)n`;
      await sql`ANALYZE creators`;
      for (const statement of ["EXPLAIN (ANALYZE,BUFFERS) SELECT name,name_ru,name_ru_source,name_ru_processed FROM creators WHERE id=50000 FOR UPDATE", "EXPLAIN UPDATE creators SET name_ru='Имя',name_ru_source='provider',name_ru_processed=true,updated_at=now() WHERE id=50000"]) {
        console.log((await sql.unsafe(statement)).map(row => row["QUERY PLAN"]).join("\n"));
      }
    }
  } finally {
    await dbClient.end();
    await sql.unsafe(`DROP SCHEMA IF EXISTS ${schema} CASCADE`);
    await sql.end();
  }
});
