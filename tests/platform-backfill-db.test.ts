import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { test } from "node:test";
import postgres from "postgres";

const testUrl = process.env.PLATFORMS_TEST_DATABASE_URL;
test("platform backfill preserves JSON, diagnoses invalid sources and creates unknown requests once", { skip: !testUrl }, async () => {
  const schema = `platform_backfill_${Date.now()}`;
  const client = postgres(testUrl!, { max: 1, onnotice() {} });
  const migration = (name: string) => readFileSync(`drizzle/${name}`, "utf8").replaceAll('"public".', `"${schema}".`).split("--> statement-breakpoint");
  try {
    await client.unsafe(`CREATE SCHEMA ${schema}`);
    await client.unsafe(`SET search_path TO ${schema}`);
    await client.unsafe(`CREATE TABLE media_types(code text PRIMARY KEY); INSERT INTO media_types VALUES('game'),('film');
      CREATE TABLE admin_users(id integer PRIMARY KEY);
      CREATE TABLE job_runs(id serial PRIMARY KEY,type text,payload jsonb,status text,error_message text);
      CREATE TABLE media_items(id integer PRIMARY KEY,media_type text);
      CREATE TABLE media_item_metadata(media_item_id integer PRIMARY KEY,facts jsonb,source_provider text);
      INSERT INTO media_items VALUES(1,'game'),(2,'game'),(3,'game'),(4,'game'),(5,'film'),(6,'game'),(7,'game');
      INSERT INTO media_item_metadata VALUES
       (1,'{"platforms":["PC (Microsoft Windows)","Linux","Xbox Series X|S"]}','igdb'),
       (2,'{"platforms":["  NEW   PLATFORM  "]}','igdb'),
       (3,'{"platforms":["PC",42]}','igdb'),
       (4,'{"platforms":["PC"]}',NULL),
       (5,'{"platforms":["PC","Unknown film"]}','igdb'),
       (6,'{"platforms":"Mac"}','rawg'),
       (7,'{"platforms":["PC"]}','unrecognized-provider');`);
    const before = await client`SELECT * FROM media_item_metadata ORDER BY media_item_id`;
    for (const name of ["0120_normalized_platforms.sql", "0121_platform_initial_mappings.sql", "0122_platform_backfill.sql"]) {
      await client.begin(async tx => { for (const statement of migration(name)) await tx.unsafe(statement); });
    }
    assert.deepEqual(await client`SELECT * FROM media_item_metadata ORDER BY media_item_id`, before);
    assert.deepEqual(Array.from(await client`SELECT l.media_item_id,p.name FROM media_item_platforms l JOIN platforms p ON p.id=l.platform_id ORDER BY l.media_item_id,p.name`), [
      { media_item_id: 1, name: "PC" }, { media_item_id: 1, name: "Xbox Series X|S" }, { media_item_id: 6, name: "Mac" },
    ]);
    assert.deepEqual(Array.from(await client`SELECT provider,normalized_external_platform_name FROM platform_requests ORDER BY provider`), [
      { provider: "igdb", normalized_external_platform_name: "new platform" },
      { provider: "unrecognized-provider", normalized_external_platform_name: "pc" },
    ]);
    assert.equal((await client`SELECT count(*)::int n FROM platform_request_media_items`)[0].n, 2);
    // Repeat the data phase; schema/trigger creation is migration-only.
    await client.begin(async tx => {
      const statements = migration("0122_platform_backfill.sql");
      for (const statement of statements.slice(1, statements.findIndex(value => value.includes("CREATE FUNCTION preserve_platform_request")))) await tx.unsafe(statement);
    });
    assert.equal((await client`SELECT count(*)::int n FROM media_item_platforms`)[0].n, 3);
    assert.equal((await client`SELECT count(*)::int n FROM platform_requests`)[0].n, 2);
    assert.equal((await client`SELECT count(*)::int n FROM platform_request_media_items`)[0].n, 2);
    assert.deepEqual(await client`SELECT * FROM media_item_metadata ORDER BY media_item_id`, before);
  } finally {
    await client.unsafe(`DROP SCHEMA IF EXISTS ${schema} CASCADE`);
    await client.end();
  }
});
