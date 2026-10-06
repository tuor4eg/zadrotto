import assert from "node:assert/strict";
import { test } from "node:test";
const testUrl = process.env.GENRES_TEST_DATABASE_URL;
test("public genre counts use one query and exclude inactive, draft and inaccessible records", { skip: !testUrl }, async () => {
  const schema = "public_genres_" + Date.now();
  const url = new URL(testUrl!);
  url.searchParams.set("options", "-c search_path=" + schema);
  process.env.DATABASE_URL = url.toString();
  const { getDbClient } = await import("../src/db");
  const { getPublicGenresPage, updateGenreName, getActiveGenreBySlug, searchArchiveGenreMatches } = await import("../src/db/queries/genres");
  const client = getDbClient();
  const { getCatalogMediaTypeCounts, getCatalogReleaseYearBounds } = await import("../src/db/queries/media-items");
  try {
    await client.unsafe("CREATE SCHEMA " + schema);
    await client.unsafe(`CREATE TABLE genres(id serial PRIMARY KEY,slug text,name text,is_active boolean,created_at timestamptz DEFAULT now(),updated_at timestamptz DEFAULT now());
      CREATE TABLE media_items(id integer PRIMARY KEY,media_type text,publication_status text,release_year integer);
      CREATE TABLE media_item_genres(media_item_id integer,genre_id integer,PRIMARY KEY(media_item_id,genre_id));
      CREATE INDEX media_item_genres_genre_id_idx ON media_item_genres(genre_id);
      INSERT INTO genres(id,slug,name,is_active) VALUES(1,'action','Action',true),(2,'hidden','Hidden',false),(3,'empty','Empty',true),(4,'hedgehog','Ёж',true),(5,'game-action','Action',true);
      INSERT INTO media_items SELECT id,CASE WHEN id<=4500 THEN 'film' ELSE 'game' END,CASE WHEN id<=4900 THEN 'published' ELSE 'draft' END,CASE WHEN id=1 THEN 2001 ELSE 1900 END FROM generate_series(1,5000) id;
      INSERT INTO media_item_genres SELECT id,1 FROM media_items;
      INSERT INTO media_item_genres SELECT id,2 FROM media_items;
      INSERT INTO media_item_genres SELECT id,5 FROM media_items WHERE media_type='game';
      INSERT INTO media_item_genres VALUES(1,4);
      ANALYZE genres; ANALYZE media_items; ANALYZE media_item_genres;`);
    const unsafe = client.unsafe;
    let queryCount = 0;
    let query = "";
    let parameters: unknown[] = [];
    client.unsafe = ((...args: Parameters<typeof unsafe>) => {
      queryCount++;
      query = String(args[0]); parameters = (args[1] ?? []) as unknown[];
      return unsafe.apply(client, args);
    }) as typeof unsafe;
    let page;
    try { page = await getPublicGenresPage({ enabledMediaTypeCodes: ["film"], page: 1, pageSize: 24, searchQuery: "" }); }
    finally { client.unsafe = unsafe; }
    assert.equal(queryCount, 1);
    assert.deepEqual(page.items.map(g => [g.slug,g.mediaItemsCount]), [["hedgehog",1],["action",4500]]);
    const plan = await client.unsafe("EXPLAIN (ANALYZE, BUFFERS, FORMAT JSON) " + query, parameters as never);
    const executionMs = plan[0]["QUERY PLAN"][0]["Execution Time"];
    console.log("Genre list EXPLAIN ANALYZE: 5000 records, 10501 links, execution ms:", executionMs);
    const both = await getPublicGenresPage({ enabledMediaTypeCodes: ["film","game"], page: 1, pageSize: 24, searchQuery: "" });
    assert.deepEqual(both.items.filter(g => g.name === "Action").map(g => g.mediaItemsCount), [4900,400]);
    assert.equal(await getActiveGenreBySlug("hidden"), null);
    assert.equal(await getActiveGenreBySlug("missing"), null);
    assert.equal((await getActiveGenreBySlug("hedgehog"))?.name, "Ёж");
    let genreFilterSql = ""; let genreFilterParameters: unknown[] = [];
    client.unsafe = ((...args: Parameters<typeof unsafe>) => {
      genreFilterSql = String(args[0]); genreFilterParameters = (args[1] ?? []) as unknown[];
      return unsafe.apply(client, args);
    }) as typeof unsafe;
    const counts = await getCatalogMediaTypeCounts({ authorRatingFilter: "all", enabledMediaTypeCodes: ["film","game"], searchQuery: "", genreId: 5, yearFilter: null, yearMode: "release" });
    client.unsafe = unsafe;
    const genrePlan = await client.unsafe("EXPLAIN (ANALYZE, BUFFERS, FORMAT JSON) " + genreFilterSql, genreFilterParameters as never);
    console.log("Archive genre filter EXPLAIN ANALYZE ms:", genrePlan[0]["QUERY PLAN"][0]["Execution Time"]);
    assert.deepEqual(counts, [{ mediaType: "game", count: 400 }]);
    assert.deepEqual(await getCatalogMediaTypeCounts({ authorRatingFilter: "all", enabledMediaTypeCodes: ["film"], searchQuery: "", genreId: 5, yearFilter: null, yearMode: "release" }), []);
    assert.equal((await getCatalogReleaseYearBounds(["film"], 4)).minReleaseYear, 2001);
    await client.unsafe("INSERT INTO genres(id,slug,name,is_active) SELECT id,'search-'||id,'Совпадение '||id,true FROM generate_series(10,14) id; INSERT INTO media_item_genres SELECT 1,id FROM generate_series(10,14) id;");
    const matches = await searchArchiveGenreMatches("совпадение", ["film"]);
    assert.equal(matches.items.length, 3);
    assert.equal(matches.totalCount, 5);
    assert.deepEqual(await searchArchiveGenreMatches("совпадение", ["game"]), { items: [], totalCount: 0 });
    assert.deepEqual(await searchArchiveGenreMatches(" ", ["film"]), { items: [], totalCount: 0 });
    const search = await getPublicGenresPage({ enabledMediaTypeCodes: ["film"], page: 1, pageSize: 24, searchQuery: "ЕЖ" });
    assert.deepEqual(search.items.map(g => g.slug), ["hedgehog"]);
    await updateGenreName(4,"Жук");
    assert.equal((await getPublicGenresPage({ enabledMediaTypeCodes: ["film"], page: 1, pageSize: 24, searchQuery: "жук" })).items[0].name,"Жук");
    assert.deepEqual((await getPublicGenresPage({ enabledMediaTypeCodes: [], page: 1, pageSize: 24, searchQuery: "" })).items, []);
  } finally { await client.unsafe("DROP SCHEMA IF EXISTS " + schema + " CASCADE"); await client.end(); }
});
