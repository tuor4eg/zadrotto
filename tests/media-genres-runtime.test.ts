import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { test } from "node:test";
import { normalizeSearchText } from "../src/lib/search/normalize";

const testUrl = process.env.GENRES_TEST_DATABASE_URL;

test("genre runtime atomically synchronizes metadata, preserves manual links, and serializes updates", { skip: !testUrl }, async () => {
  // Explicit opt-in URL; never use the application's configured database for these tests.
  process.env.DATABASE_URL = testUrl;
  process.env.DATABASE_MAX_CONNECTIONS = "2";
  const { db, getDbClient } = await import("../src/db");
  const { upsertMediaItemMetadata, getMediaItemMetadata, deleteMediaItemMetadata } = await import("../src/db/queries/media-item-metadata");
  const { resolveProviderGenres, mediaItemGenresJsonSql, normalizeGenreNameSql } = await import("../src/db/queries/media-item-genres");
  const { mediaItems } = await import("../src/db/schema");
  const { sql, eq } = await import("drizzle-orm");
  const schema = `genre_runtime_${Date.now()}`;
  // A startup search_path on every pool connection is necessary for the concurrency check.
  // Configure before importing DB above, which initializes lazily on first actual query.
  const url = new URL(testUrl!);
  url.searchParams.set("options", `-c search_path=${schema}`);
  process.env.DATABASE_URL = url.toString();
  const dbClient = getDbClient();
  try {
    await dbClient.unsafe(`CREATE SCHEMA ${schema}`);
    await dbClient.begin(async (tx) => {
      await tx.unsafe(`SET LOCAL search_path TO ${schema}`);
      await tx.unsafe(`CREATE TABLE media_types(code text PRIMARY KEY);
        CREATE TABLE admin_users(id integer PRIMARY KEY);
        CREATE TABLE job_runs(id serial PRIMARY KEY, payload jsonb, type text, status text, error_message text);
        INSERT INTO media_types VALUES ('film'),('series'),('anime'),('game');
        CREATE TABLE media_items(id integer PRIMARY KEY, title text NOT NULL, media_type text NOT NULL, metadata_issue_code text);
        CREATE TABLE media_item_metadata(media_item_id integer PRIMARY KEY REFERENCES media_items(id), facts jsonb NOT NULL DEFAULT '{}',
          source_provider text, source_external_id text, source_url text, fetched_at timestamptz,
          created_at timestamptz NOT NULL DEFAULT now(), updated_at timestamptz NOT NULL DEFAULT now());
        CREATE TABLE media_item_provider_snapshots(media_item_id integer PRIMARY KEY, media_type text, provider_code text, facts jsonb);
        CREATE TABLE admin_activity_logs(id serial PRIMARY KEY, created_at timestamptz DEFAULT now(), actor_type text, admin_user_id integer,
          author_id integer, action text, entity_type text, entity_id integer, entity_label text, status text, severity text, message text,
          ip_address text, user_agent text, metadata jsonb);
        INSERT INTO media_items VALUES (1,'Series','series',NULL),(2,'Game','game',NULL),(3,'Anime','anime',NULL);`);
      for (const statement of readFileSync("drizzle/0103_unified_genres.sql", "utf8").split("--> statement-breakpoint")) await tx.unsafe(statement);
      for (const statement of readFileSync("drizzle/0104_genre_requests.sql", "utf8").split("--> statement-breakpoint")) await tx.unsafe(statement);
    });

    const input = { mediaItemId: 1, sourceProvider: "tmdb", facts: { genres: ["Боевик и Приключения", "НФ и Фэнтези", "Неизвестный"] } };
    const first = await upsertMediaItemMetadata(input);
    assert.deepEqual(first.genres.map((g) => g.slug), ["action", "adventure", "fantasy", "sci-fi"]);
    assert.deepEqual(first.facts, input.facts);
    assert.deepEqual((await getMediaItemMetadata(1))?.genres, first.genres);
    const batch = await db.select({ id: mediaItems.id, genres: mediaItemGenresJsonSql() }).from(mediaItems).orderBy(mediaItems.id);
    assert.deepEqual(batch.map((item) => item.genres), [first.genres, [], []]);
    const linksBefore = await dbClient`SELECT * FROM media_item_genres WHERE media_item_id=1 ORDER BY genre_id`;
    await upsertMediaItemMetadata(input);
    assert.deepEqual(await dbClient`SELECT * FROM media_item_genres WHERE media_item_id=1 ORDER BY genre_id`, linksBefore);
    assert.equal((await dbClient`SELECT count(*)::int AS n FROM admin_activity_logs WHERE action='genre-request.detected'`)[0].n, 1);
    await dbClient`INSERT INTO provider_genre_mappings(provider, media_type, external_genre_id, external_genre_name, normalized_external_genre_name, genre_id)
      SELECT 'tmdb','series','999','Composite','composite',id FROM genres WHERE slug IN ('comedy','drama')`;
    const byId = await resolveProviderGenres({ provider: "tmdb", mediaType: "series", facts: {
      genres: ["Renamed"], genreReferences: [{ id: "999", name: "Renamed" }],
    } });
    assert.deepEqual(byId.genres.map((genre) => genre.slug), ["comedy", "drama"]);
    assert.deepEqual(byId.unmapped, []);

    await dbClient`UPDATE media_item_genres SET is_manual=true WHERE media_item_id=1 AND genre_id=(SELECT id FROM genres WHERE slug='action')`;
    await upsertMediaItemMetadata({ mediaItemId: 1, sourceProvider: "other", facts: { genres: [] } });
    assert.deepEqual((await getMediaItemMetadata(1))?.genres.map((g) => g.slug), ["action"]);
    assert.equal((await dbClient`SELECT provider FROM media_item_genres WHERE media_item_id=1`)[0].provider, null);
    await upsertMediaItemMetadata({ mediaItemId: 1, sourceProvider: "tmdb", facts: { genres: ["Боевик и Приключения"] } });
    assert.equal((await dbClient`SELECT is_manual FROM media_item_genres WHERE media_item_id=1 AND genre_id=(SELECT id FROM genres WHERE slug='action')`)[0].is_manual, true);
    await deleteMediaItemMetadata(1);
    assert.equal(await getMediaItemMetadata(1), null);
    assert.equal((await dbClient`SELECT count(*)::int AS n FROM media_item_genres WHERE media_item_id=1`)[0].n, 1);

    await upsertMediaItemMetadata({ mediaItemId: 2, sourceProvider: "igdb", facts: { genres: ["Role-playing (RPG)", "Simulator", "Platform", "Sport"] } });
    await upsertMediaItemMetadata({ mediaItemId: 2, sourceProvider: "rawg", facts: { genres: ["RPG", "Simulation", "Platformer", "Sports"] } });
    assert.deepEqual((await getMediaItemMetadata(2))?.genres.map((g) => g.slug), ["game-platform", "game-rpg", "game-simulator", "game-sport"]);
    const beforeInvalid = await getMediaItemMetadata(2);
    await assert.rejects(upsertMediaItemMetadata({ mediaItemId: 2, sourceProvider: "rawg", facts: { genres: [42] } }));
    assert.deepEqual(await getMediaItemMetadata(2), beforeInvalid);

    await dbClient.unsafe(`CREATE FUNCTION reject_genre_sync() RETURNS trigger LANGUAGE plpgsql AS $$ BEGIN RAISE EXCEPTION 'sync failed'; END $$;
      CREATE TRIGGER reject_genre_sync BEFORE INSERT ON media_item_genres FOR EACH ROW EXECUTE FUNCTION reject_genre_sync();`);
    await assert.rejects(upsertMediaItemMetadata({ mediaItemId: 2, sourceProvider: "rawg", facts: { genres: ["Action"] } }));
    assert.deepEqual(await getMediaItemMetadata(2), beforeInvalid);
    await dbClient.unsafe("DROP TRIGGER reject_genre_sync ON media_item_genres");

    await Promise.all([
      upsertMediaItemMetadata({ mediaItemId: 3, sourceProvider: "anilist", facts: { genres: ["Romance", "Mystery"] } }),
      upsertMediaItemMetadata({ mediaItemId: 3, sourceProvider: "anilist", facts: { genres: ["Drama"] } }),
    ]);
    const last = (await getMediaItemMetadata(3))!;
    const expected = await resolveProviderGenres({ facts: last.facts, provider: "anilist", mediaType: "anime" });
    assert.deepEqual(last.genres, expected.genres);
    await upsertMediaItemMetadata({ mediaItemId: 3, sourceProvider: "anilist", facts: {} });
    assert.deepEqual((await getMediaItemMetadata(3))?.genres, []);

    await dbClient`UPDATE genres SET is_active=false WHERE slug='action'`;
    assert.deepEqual(await db.select({ genres: mediaItemGenresJsonSql() }).from(mediaItems).where(eq(mediaItems.id, 1)), [{ genres: [] }]);
    assert.equal((await resolveProviderGenres({ provider: "tmdb", mediaType: "series", facts: { genres: ["Боевик и Приключения"] } })).unmapped.length, 0);
    for (const value of ["ЁЖ", "  Ёж   и\tЕль  ", "НФ   и  Фэнтези", "\t\nЁж\n\t"]) {
      const [row] = await db.select({ normalized: normalizeGenreNameSql(sql`${value}`) }).from(mediaItems).limit(1);
      assert.equal(row.normalized, normalizeSearchText(value));
    }
    const [plan] = await dbClient.unsafe(`EXPLAIN (FORMAT JSON) SELECT id, (SELECT coalesce(jsonb_agg(g.name),'[]') FROM media_item_genres l JOIN genres g ON g.id=l.genre_id WHERE l.media_item_id=m.id) FROM media_items m`);
    assert.ok(plan["QUERY PLAN"]);
  } finally {
    await dbClient.unsafe(`DROP SCHEMA IF EXISTS ${schema} CASCADE`);
    await dbClient.end();
  }
});
