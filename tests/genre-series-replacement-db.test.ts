import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { test } from "node:test";

const testUrl = process.env.GENRES_TEST_DATABASE_URL;

test("genre series replacement follows published branches without changing source genre links", { skip: !testUrl }, async () => {
  const schema = `genre_series_${Date.now()}`;
  const url = new URL(testUrl!);
  url.searchParams.set("options", `-c search_path=${schema}`);
  process.env.DATABASE_URL = url.toString();
  const { db, getDbClient } = await import("../src/db");
  const { mediaItems } = await import("../src/db/schema");
  const { sql, eq } = await import("drizzle-orm");
  const { publicMediaItemGenresJsonSql, mediaItemGenresJsonSql, hasUnifiedGenresSql, missingGenreSeriesBindingSql } = await import("../src/db/queries/media-item-genres");
  const { updateGenre, getPublicGenresPage, searchArchiveGenreMatches, getGenreReplacementFranchiseIds } = await import("../src/db/queries/genres");
  const { getCatalogMediaTypeCounts, getCatalogReleaseYearBounds } = await import("../src/db/queries/media-items");
  const client = getDbClient();
  try {
    await client.unsafe(`CREATE SCHEMA ${schema}`);
    await client.unsafe(`CREATE TABLE franchises(id integer PRIMARY KEY,parent_id integer,title text,code text,publication_status text);
      CREATE INDEX franchises_parent_id_idx ON franchises(parent_id);
      CREATE TABLE media_items(id integer PRIMARY KEY,media_type text,publication_status text,release_year integer);
      CREATE TABLE media_item_franchises(media_item_id integer,franchise_id integer,publication_status text,PRIMARY KEY(media_item_id,franchise_id));
      CREATE TABLE genres(id integer PRIMARY KEY,slug text,name text,is_active boolean DEFAULT true,created_at timestamptz DEFAULT now(),updated_at timestamptz DEFAULT now());
      CREATE TABLE media_item_genres(media_item_id integer,genre_id integer,provider text,is_manual boolean,PRIMARY KEY(media_item_id,genre_id));
      CREATE INDEX media_item_genres_genre_id_idx ON media_item_genres(genre_id);`);
    // Keep the migration's FK local to this isolated schema.
    for (const statement of readFileSync("drizzle/0108_genre_replacement_series.sql", "utf8").split("--> statement-breakpoint")) {
      await client.unsafe(statement.replace('"public"."franchises"', `"${schema}"."franchises"`));
    }
    await client.unsafe(`INSERT INTO franchises VALUES(1,NULL,'West','west','published'),(2,1,'Child','child','published'),
      (3,1,'Draft middle','middle','draft'),(4,3,'Grandchild','grandchild','published'),(5,NULL,'Other','other','published'),(6,NULL,'Draft root','draft','draft');
      INSERT INTO genres(id,slug,name,is_active,replacement_franchise_id) VALUES
        (1,'western','Western',true,1),(2,'ordinary','Ordinary',true,NULL),(3,'other','Other',true,5),(4,'inactive','Inactive',false,5),(5,'draft','Draft',true,6);
      INSERT INTO media_items SELECT id,'film','published',2000+id FROM generate_series(1,9) id;
      INSERT INTO media_item_genres SELECT id,1,'tmdb',false FROM media_items;
      INSERT INTO media_item_genres VALUES(1,2,NULL,true),(2,3,'tmdb',false),(3,4,'tmdb',false),(8,5,'tmdb',false);
      INSERT INTO media_item_franchises VALUES(1,1,'published'),(2,2,'published'),(3,1,'draft'),(4,4,'published'),(5,5,'published'),(6,2,'draft'),(8,6,'published');`);
    const links = await client`SELECT * FROM media_item_genres ORDER BY media_item_id,genre_id`;
    assert.deepEqual(await getGenreReplacementFranchiseIds([1, 1, 2, 3, 4, 5, 999]), [1, 5]);
    assert.deepEqual(await getGenreReplacementFranchiseIds([]), []);
    assert.deepEqual(await getGenreReplacementFranchiseIds([2, 4, 5]), []);
    const projection = () => db.select({ id: mediaItems.id, genres: publicMediaItemGenresJsonSql(), raw: mediaItemGenresJsonSql(), unified: hasUnifiedGenresSql(), missing: missingGenreSeriesBindingSql() })
      .from(mediaItems).orderBy(mediaItems.id);
    const rows = await projection();
    assert.deepEqual(rows.map(row => row.genres.map(genre => genre.slug)), [["ordinary"],["other"],["western"],["western"],["western"],["western"],["western"],["draft","western"],["western"]]);
    assert.ok(rows.every(row => row.unified));
    assert.deepEqual(rows.filter(row => row.missing).map(row => row.id), [2,3,4,5,6,7,8,9]);
    assert.deepEqual(rows[1].raw.map(genre => genre.slug), ["other","western"]);
    const catalogInput = { authorRatingFilter: "all" as const, enabledMediaTypeCodes: ["film"], searchQuery: "", genreId: 1, yearFilter: null, yearMode: "release" as const };
    assert.deepEqual(await getCatalogMediaTypeCounts(catalogInput), [{ mediaType: "film", count: 7 }]);
    assert.deepEqual(await getCatalogReleaseYearBounds(["film"], 1), { minReleaseYear: 2003 });
    assert.equal((await getPublicGenresPage({ enabledMediaTypeCodes: ["film"], searchQuery: "Western", page: 1, pageSize: 24 })).items[0].mediaItemsCount, 7);
    assert.equal((await searchArchiveGenreMatches("Western", ["film"])).items[0].mediaItemsCount, 7);

    const before = (await client`SELECT * FROM genres WHERE id=1`)[0];
    for (const invalidId of [-1, 1.5, 2147483648, 999, 6]) {
      await assert.rejects(updateGenre(1, "Changed", invalidId));
      assert.deepEqual((await client`SELECT * FROM genres WHERE id=1`)[0], before);
    }
    await assert.rejects(updateGenre(1, " \t ", null));
    assert.equal(await updateGenre(999, "Missing", null), null);
    await updateGenre(1, " Western ", null);
    assert.ok((await projection()).every(row => row.genres.some(genre => genre.slug === "western")));
    await updateGenre(1, "Western", 5);
    assert.deepEqual((await projection())[4].genres, []);
    await updateGenre(1, "Western", 1);
    await client`UPDATE franchises SET publication_status='draft' WHERE id=1`;
    assert.deepEqual(await getGenreReplacementFranchiseIds([1]), []);
    await updateGenre(1, "Renamed while draft", 1); // An existing unpublished choice remains editable.
    assert.ok((await projection()).every(row => row.genres.some(genre => genre.slug === "western")));
    await client`UPDATE franchises SET publication_status='published' WHERE id=1`;
    await client`DELETE FROM franchises WHERE id=1`;
    assert.equal((await client`SELECT replacement_franchise_id FROM genres WHERE id=1`)[0].replacement_franchise_id, null);
    assert.deepEqual(await client`SELECT * FROM media_item_genres ORDER BY media_item_id,genre_id`, links);

    // Hide every Western occurrence to verify direct genre URLs have empty counts/bounds.
    await updateGenre(1, "Western", 5);
    await client`INSERT INTO media_item_franchises SELECT id,5,'published' FROM media_items ON CONFLICT DO NOTHING`;
    assert.deepEqual(await getCatalogMediaTypeCounts(catalogInput), []);
    assert.deepEqual(await getCatalogReleaseYearBounds(["film"], 1), { minReleaseYear: null });
    assert.equal((await searchArchiveGenreMatches("Western", ["film"])).totalCount, 0);

    await client.unsafe(`INSERT INTO media_items SELECT id,'film','published',1990 FROM generate_series(10,5000) id;
      INSERT INTO media_item_genres SELECT id,1,'tmdb',false FROM media_items WHERE id>=10;
      INSERT INTO media_item_franchises SELECT id,5,'published' FROM media_items WHERE id>=10 AND id%2=0;
      ANALYZE media_items; ANALYZE media_item_genres; ANALYZE media_item_franchises; ANALYZE genres; ANALYZE franchises;`);
    const query = db.select({ count: sql<number>`count(*)::int` }).from(mediaItems).where(missingGenreSeriesBindingSql()).toSQL();
    const plan = await client.unsafe(`EXPLAIN (ANALYZE, BUFFERS, FORMAT JSON) ${query.sql}`, query.params as never);
    console.log("Missing series binding EXPLAIN ANALYZE: 5000 records, execution ms:", plan[0]["QUERY PLAN"][0]["Execution Time"]);
    const [count] = await db.select({ count: sql<number>`count(*)::int` }).from(mediaItems).where(missingGenreSeriesBindingSql());
    assert.equal(count.count, 2496); // Odd added records plus the unpublished Draft genre on record 8.
    const [hidden] = await db.select({ genres: publicMediaItemGenresJsonSql(), unified: hasUnifiedGenresSql() }).from(mediaItems).where(eq(mediaItems.id, 10));
    assert.deepEqual(hidden.genres, []);
    assert.equal(hidden.unified, true);
  } finally {
    await client.unsafe(`DROP SCHEMA IF EXISTS ${schema} CASCADE`);
    await client.end();
  }
});
