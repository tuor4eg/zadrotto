import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { test } from "node:test";
import postgres from "postgres";

const migration = readFileSync("drizzle/0103_unified_genres.sql", "utf8");
const testUrl = process.env.GENRES_TEST_DATABASE_URL;

test("genre migration seeds 53 genres, expands mappings and preserves raw facts", { skip: !testUrl }, async () => {
  const notices: string[] = [];
  const db = postgres(testUrl!, { max: 1, onnotice: (notice) => { notices.push(notice.message); } });
  const schema = `genre_migration_${Date.now()}`;
  try {
    await db.begin(async (tx) => {
      await tx.unsafe(`CREATE SCHEMA ${schema}; SET LOCAL search_path TO ${schema}`);
      await tx.unsafe(`CREATE TABLE media_types(code text PRIMARY KEY);
        INSERT INTO media_types VALUES ('film'), ('series'), ('anime'), ('game');
        CREATE TABLE media_items(id integer PRIMARY KEY, media_type text);
        CREATE TABLE media_item_metadata(media_item_id integer PRIMARY KEY, source_provider text, facts jsonb);
        CREATE TABLE media_item_provider_snapshots(media_item_id integer PRIMARY KEY, media_type text, provider_code text, facts jsonb);
        INSERT INTO media_items VALUES (1,'series'), (2,'film'), (3,'game'), (4,'anime'), (5,'film'), (6,'anime');
        INSERT INTO media_item_metadata VALUES
          (1,'tmdb','{"genres":["НФ и Фэнтези","Боевик и Приключения","Война и Политика"]}'),
          (2,'tmdb','{"genres":["телевизионный фильм","неизвестный",42]}'),
          (3,'rawg','{"genres":["RPG","Platformer","Simulation","Sports"]}'),
          (4,NULL,'{"genres":["Romance","Mystery"]}'),
          (5,'tmdb',jsonb_build_object('genres', E'\\t\\nКОМЕДИЯ\\n\\t')),
          (6,'tmdb','{"genres":["НФ и Фэнтези","Боевик и Приключения"]}');
        INSERT INTO media_item_provider_snapshots VALUES (4,'anime','anilist','{"genres":["Romance","Mystery"]}');`);
      const before = await tx`SELECT * FROM media_item_metadata ORDER BY media_item_id`;
      const statements = migration.split("--> statement-breakpoint");
      for (const statement of statements) await tx.unsafe(statement);
      assert.equal((await tx`SELECT count(*)::int AS count FROM genres`)[0].count, 53);
      assert.equal((await tx`SELECT count(*)::int AS count FROM media_item_genres`)[0].count, 17);
      assert.deepEqual(await tx`SELECT * FROM media_item_metadata ORDER BY media_item_id`, before);
      assert.ok(notices.some((message) => message.includes("unmapped genre")));
      assert.ok(notices.some((message) => message.includes("invalid genre element")));
      assert.ok(notices.some((message) => message.includes("intentionally excluded TV Movie")));
      // Replay the seed and data DML independently of Drizzle's migration journal.
      await tx`DROP TABLE unified_genre_backfill`;
      for (const statement of statements.slice(6)) await tx.unsafe(statement);
      assert.equal((await tx`SELECT count(*)::int AS count FROM media_item_genres`)[0].count, 17);
      const mappings = await tx`SELECT count(*)::int AS count FROM provider_genre_mappings
        WHERE provider='tmdb' AND media_type='series' AND external_genre_name='НФ и Фэнтези'`;
      assert.equal(mappings[0].count, 2);
      const genreId = (await tx`SELECT id FROM genres WHERE slug='comedy'`)[0].id;
      await assert.rejects(tx.savepoint(async (sp) => {
        await sp`INSERT INTO media_item_genres(media_item_id, genre_id) VALUES (2, ${genreId})`;
      }), /media_item_genres_source_check/);
      await tx`INSERT INTO media_item_genres(media_item_id, genre_id, is_manual) VALUES (2, ${genreId}, true)`;
      await assert.rejects(tx.savepoint(async (sp) => {
        await sp`INSERT INTO media_item_genres(media_item_id, genre_id, provider) VALUES (2, ${genreId}, 'tmdb')`;
      }), /duplicate key/);
      await assert.rejects(tx.savepoint(async (sp) => {
        await sp`INSERT INTO provider_genre_mappings(provider, media_type, external_genre_name, normalized_external_genre_name, genre_id)
          VALUES ('tmdb','film','комедия','комедия',${genreId})`;
      }), /duplicate key/);
      await assert.rejects(tx.savepoint(async (sp) => {
        await sp`DELETE FROM genres WHERE id=${genreId}`;
      }), /foreign key constraint/);
      await tx`INSERT INTO provider_genre_mappings(provider, media_type, external_genre_id, external_genre_name, normalized_external_genre_name, genre_id)
        SELECT 'tmdb','series','999','Composite','composite',id FROM genres WHERE slug IN ('comedy','drama')`;
      await assert.rejects(tx.savepoint(async (sp) => {
        await sp`INSERT INTO provider_genre_mappings(provider, media_type, external_genre_id, external_genre_name, normalized_external_genre_name, genre_id)
          VALUES ('tmdb','series','999','Alias','alias',${genreId})`;
      }), /provider_genre_mappings_id_unique_idx/);
      await tx.unsafe(`DROP SCHEMA ${schema} CASCADE`);
    });
  } finally {
    await db.end();
  }
});
