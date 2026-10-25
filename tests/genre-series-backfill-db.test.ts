import assert from "node:assert/strict";
import { test } from "node:test";

const testUrl = process.env.GENRES_TEST_DATABASE_URL;

test("subject genre series application adds only missing published links and preserves existing decisions", { skip: !testUrl }, async () => {
  const schema = `genre_series_backfill_${Date.now()}`;
  const url = new URL(testUrl!);
  url.searchParams.set("options", `-c search_path=${schema}`);
  process.env.DATABASE_URL = url.toString();
  const { getDbClient } = await import("../src/db");
  const { applyGenreSeriesLinks } = await import("../src/db/queries/genre-series-backfill");
  const client = getDbClient();
  const apply = (genreId: number, signal?: AbortSignal) => applyGenreSeriesLinks({ genreId, afterId: 0, throughId: 14, limit: 100 }, signal);
  try {
    await client.unsafe(`CREATE SCHEMA ${schema}`);
    await client.unsafe(`CREATE TABLE media_items(id integer PRIMARY KEY,publication_status text);
      CREATE TABLE franchises(id integer PRIMARY KEY,parent_id integer,publication_status text);
      CREATE INDEX franchises_parent_id_idx ON franchises(parent_id);
      CREATE TABLE genres(id integer PRIMARY KEY,is_active boolean,replacement_franchise_id integer);
      CREATE TABLE media_item_genres(media_item_id integer,genre_id integer,PRIMARY KEY(media_item_id,genre_id));
      CREATE TABLE media_item_franchises(media_item_id integer,franchise_id integer,created_by_author_id integer,
        publication_status text,created_at timestamptz DEFAULT now(),updated_at timestamptz DEFAULT now(),PRIMARY KEY(media_item_id,franchise_id));
      INSERT INTO franchises VALUES(1,NULL,'published'),(2,1,'published'),(3,NULL,'published'),(4,NULL,'private'),(5,1,'private'),(6,5,'published');
      INSERT INTO genres VALUES(1,true,1),(2,true,2),(3,true,3),(4,true,4),(5,false,1),(6,true,1);
      INSERT INTO media_items SELECT id,CASE WHEN id=3 THEN 'private' ELSE 'published' END FROM generate_series(1,14) id;
      INSERT INTO media_item_genres VALUES(1,1),(2,1),(3,1),(4,1),(5,1),(6,1),(6,2),(7,4),(8,5),(9,1),(10,1),(11,1),(13,1),(13,3),(14,1),(14,6);
      INSERT INTO media_item_franchises(media_item_id,franchise_id,created_by_author_id,publication_status)
        VALUES(2,2,10,'published'),(4,1,10,'submitted'),(5,1,10,'rejected'),(9,3,10,'published'),(10,1,10,'published'),(11,6,10,'published');`);
    const before = await client`SELECT media_item_id,franchise_id,created_by_author_id,publication_status,
      created_at::text AS created_at,updated_at::text AS updated_at FROM media_item_franchises ORDER BY media_item_id,franchise_id`;
    const genresBefore = await client`SELECT * FROM media_item_genres ORDER BY media_item_id,genre_id`;
    await apply(2);
    assert.ok((await apply(1)).addedLinks > 0);
    await apply(3);
    const after = await client`SELECT media_item_id,franchise_id,created_by_author_id,publication_status,
      created_at::text AS created_at,updated_at::text AS updated_at FROM media_item_franchises ORDER BY media_item_id,franchise_id`;
    for (const link of before) assert.deepEqual(after.find(row => row.media_item_id === link.media_item_id && row.franchise_id === link.franchise_id), link);
    assert.deepEqual(after.filter(row => row.media_item_id === 6).map(row => row.franchise_id), [2]);
    assert.ok(after.filter(row => !before.some(old => old.media_item_id === row.media_item_id && old.franchise_id === row.franchise_id))
      .every(row => row.publication_status === "published" && row.created_by_author_id === null));
    assert.deepEqual(await client`SELECT * FROM media_item_genres ORDER BY media_item_id,genre_id`, genresBefore);
    assert.equal((await apply(1)).addedLinks, 0);
    // A later genre update cannot create a series link until another manual run.
    await client`INSERT INTO media_item_genres VALUES(12,1)`;
    assert.equal((await client`SELECT count(*)::int AS n FROM media_item_franchises WHERE media_item_id=12`)[0].n, 0);
    const controller = new AbortController(); controller.abort();
    await assert.rejects(apply(1, controller.signal));
    assert.equal((await client`SELECT count(*)::int AS n FROM media_item_franchises WHERE media_item_id=12`)[0].n, 0);
    assert.equal((await apply(1)).addedLinks, 1);
    // Simultaneous manual runs do not duplicate links.
    await client`DELETE FROM media_item_franchises WHERE media_item_id=12`;
    const results = await Promise.all([apply(1), apply(1)]);
    assert.equal(results.reduce((total, result) => total + result.addedLinks, 0), 1);
  } finally {
    await client.unsafe(`DROP SCHEMA IF EXISTS ${schema} CASCADE`);
    await client.end();
  }
});
