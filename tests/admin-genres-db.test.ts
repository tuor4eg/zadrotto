import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { test } from "node:test";

const testUrl = process.env.GENRES_TEST_DATABASE_URL;

test("admin genres load in two queries and rename only the shared display name", { skip: !testUrl }, async () => {
  const schema = `admin_genres_${Date.now()}`;
  const url = new URL(testUrl!);
  url.searchParams.set("options", `-c search_path=${schema}`);
  process.env.DATABASE_URL = url.toString();
  process.env.DATABASE_MAX_CONNECTIONS = "2";
  const { db, getDbClient } = await import("../src/db");
  const { getAdminGenres, getAdminGenresPage, getAdminGenreById, updateGenreName } = await import("../src/db/queries/genres");
  const { mediaItemGenresJsonSql } = await import("../src/db/queries/media-item-genres");
  const { mediaItems } = await import("../src/db/schema");
  const { formatMediaItemSummary } = await import("../src/lib/media/media-item-summary");
  const { eq } = await import("drizzle-orm");
  const client = getDbClient();
  try {
    await client.unsafe(`CREATE SCHEMA ${schema}`);
    await client.begin(async (tx) => {
      await tx.unsafe(`CREATE TABLE media_types(code text PRIMARY KEY, name text NOT NULL);
        INSERT INTO media_types VALUES ('film','Фильм'),('series','Сериал'),('anime','Аниме'),('game','Игра');
        CREATE TABLE media_items(id integer PRIMARY KEY, media_type text);
        CREATE TABLE media_item_metadata(media_item_id integer PRIMARY KEY, source_provider text, facts jsonb);
        CREATE TABLE media_item_provider_snapshots(media_item_id integer PRIMARY KEY, media_type text, provider_code text, facts jsonb);
        CREATE TABLE job_runs(id integer PRIMARY KEY, status text);
        CREATE TABLE genre_requests(id integer PRIMARY KEY, provider text, media_type text,
          normalized_external_genre_name text, job_run_id integer, apply_status text);
        INSERT INTO media_items VALUES (1,'film'),(2,'series');
        INSERT INTO media_item_metadata VALUES (1,'tmdb','{"genres":["боевик"]}'),(2,'tmdb','{"genres":["Боевик и Приключения"]}');`);
      for (const statement of readFileSync("drizzle/0103_unified_genres.sql", "utf8").split("--> statement-breakpoint")) await tx.unsafe(statement);
    });
    const originalUnsafe = client.unsafe;
    let queryCount = 0;
    client.unsafe = ((...args: Parameters<typeof originalUnsafe>) => {
      queryCount += 1;
      return originalUnsafe.apply(client, args);
    }) as typeof originalUnsafe;
    let list;
    try {
      list = await getAdminGenres();
      assert.equal(queryCount, 2);
    } finally {
      client.unsafe = originalUnsafe;
    }
    assert.equal(list.length, 53);
    const firstPage = await getAdminGenresPage({ searchQuery: "", page: 1 });
    const secondPage = await getAdminGenresPage({ searchQuery: "", page: 2 });
    assert.equal(firstPage.items.length, 25);
    assert.equal(firstPage.total, 53);
    assert.equal(firstPage.totalPages, 3);
    assert.ok(secondPage.items.every((genre) => !firstPage.items.some((first) => first.id === genre.id)));
    assert.equal((await getAdminGenresPage({ searchQuery: "", page: 999 })).page, 3);
    const searchPage = await getAdminGenresPage({ searchQuery: "  БОЕВИК И ПРИКЛЮЧЕНИЯ  ", page: 1 });
    assert.ok(searchPage.items.some((genre) => genre.slug === "action"));
    assert.ok(searchPage.items.some((genre) => genre.slug === "adventure"));
    assert.equal((await getAdminGenresPage({ searchQuery: "нет такого жанра 987", page: 1 })).total, 0);
    const action = list.find((genre) => genre.slug === "action")!;
    assert.equal(action.mediaItemsCount, 2); // Several mappings must not inflate the count.
    assert.ok(action.providerVariants.some((group) => group.provider === "tmdb" && group.mediaType === "series" && group.names.includes("Боевик и Приключения")));
    const adventure = list.find((genre) => genre.slug === "adventure")!;
    assert.ok(adventure.providerVariants.some((group) => group.mediaType === "series" && group.names.includes("Боевик и Приключения")));
    assert.equal((await getAdminGenreById(action.id))?.mediaItemsCount, 2);
    assert.equal(await getAdminGenreById(2147483647), null);
    const [seriesMapping] = await client`SELECT id FROM provider_genre_mappings WHERE genre_id=${action.id}
      AND provider='tmdb' AND media_type='series' AND external_genre_name='Боевик и Приключения'`;
    const seriesVariant = () => getAdminGenreById(action.id).then((genre) => genre?.providerVariants
      .find((group) => group.provider === "tmdb" && group.mediaType === "series")?.variants?.find((variant) => variant.mappingId === Number(seriesMapping.id)));
    assert.equal((await seriesVariant())?.applying, false);
    await client`INSERT INTO job_runs VALUES (1,'queued')`;
    await client`INSERT INTO genre_requests VALUES (1,'tmdb','series','боевик и приключения',1,'applying')`;
    assert.equal((await seriesVariant())?.applying, true);
    await client`UPDATE job_runs SET status='running' WHERE id=1`;
    assert.equal((await seriesVariant())?.applying, true);
    await client`UPDATE job_runs SET status='succeeded' WHERE id=1`;
    assert.equal((await seriesVariant())?.applying, false);

    const links = await client`SELECT * FROM media_item_genres ORDER BY media_item_id,genre_id`;
    const mappings = await client`SELECT * FROM provider_genre_mappings ORDER BY id`;
    const metadata = await client`SELECT * FROM media_item_metadata ORDER BY media_item_id`;
    const [before] = await client`SELECT * FROM genres WHERE id=${action.id}`;
    await updateGenreName(action.id, "  Экшен  ");
    const [after] = await client`SELECT * FROM genres WHERE id=${action.id}`;
    assert.deepEqual({ ...after, name: before.name, updated_at: before.updated_at }, before);
    assert.equal(after.name, "Экшен");
    assert.deepEqual(await client`SELECT * FROM media_item_genres ORDER BY media_item_id,genre_id`, links);
    assert.deepEqual(await client`SELECT * FROM provider_genre_mappings ORDER BY id`, mappings);
    assert.deepEqual(await client`SELECT * FROM media_item_metadata ORDER BY media_item_id`, metadata);
    const [card] = await db.select({ genres: mediaItemGenresJsonSql() }).from(mediaItems).where(eq(mediaItems.id, 1));
    assert.equal(formatMediaItemSummary({ mediaType: "film", mediaTypeLabel: "Фильм", releaseYear: null, genres: card.genres }), "Фильм · Экшен");
    assert.equal((await getAdminGenreById(action.id))?.name, "Экшен");
    await updateGenreName(adventure.id, "Экшен"); // Duplicate names are explicitly allowed.
    await assert.rejects(updateGenreName(action.id, " \t "));
    assert.equal(await updateGenreName(2147483647, "Нет такого жанра"), null);
    await client`UPDATE genres SET is_active=false WHERE id=${action.id}`;
    assert.equal((await getAdminGenreById(action.id))?.isActive, false);
    await client`DELETE FROM provider_genre_mappings WHERE genre_id=${action.id}`;
    assert.deepEqual((await getAdminGenreById(action.id))?.providerVariants, []);
  } finally {
    await client.unsafe(`DROP SCHEMA IF EXISTS ${schema} CASCADE`);
    await client.end();
  }
});
