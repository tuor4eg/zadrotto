import assert from "node:assert/strict";
import { test } from "node:test";

const testUrl = process.env.PLATFORMS_TEST_DATABASE_URL;

test("public platform counts and catalog filters require published games and combine genres with AND", { skip: !testUrl }, async () => {
  const schema = `public_platforms_${Date.now()}`;
  const url = new URL(testUrl!);
  url.searchParams.set("options", `-c search_path=${schema}`);
  process.env.DATABASE_URL = url.toString();
  const { getDbClient } = await import("../src/db");
  const { getPublicPlatformsPage, getActivePlatformBySlug, searchArchivePlatformMatches } = await import("../src/db/queries/platforms");
  const { getCatalogMediaTypeCounts, getCatalogReleaseYearBounds } = await import("../src/db/queries/media-items");
  const client = getDbClient();
  try {
    await client.unsafe(`CREATE SCHEMA ${schema}`);
    await client.unsafe(`CREATE TABLE platforms(id integer PRIMARY KEY,slug text,name text,is_active boolean);
      CREATE TABLE media_items(id integer PRIMARY KEY,media_type text,publication_status text,release_year integer);
      CREATE TABLE media_item_platforms(media_item_id integer,platform_id integer,PRIMARY KEY(media_item_id,platform_id));
      CREATE INDEX media_item_platforms_platform_id_idx ON media_item_platforms(platform_id);
      CREATE TABLE genres(id integer PRIMARY KEY,is_active boolean,replacement_franchise_id integer);
      CREATE TABLE media_item_genres(media_item_id integer,genre_id integer);
      CREATE TABLE franchises(id integer PRIMARY KEY,parent_id integer,publication_status text);
      CREATE TABLE media_item_franchises(media_item_id integer,franchise_id integer,publication_status text);
      INSERT INTO platforms VALUES(1,'pc','PC',true),(2,'mac','Mac',true),(3,'hidden','Hidden',false),(4,'empty','Empty',true),(5,'hedgehog','Ёж',true);
      INSERT INTO media_items VALUES(1,'game','published',2001),(2,'game','published',1995),(3,'game','draft',1980),(4,'film','published',1900),(5,'game','published',2010);
      INSERT INTO media_item_platforms VALUES(1,1),(2,1),(3,1),(4,1),(1,2),(5,3),(1,5);
      INSERT INTO genres VALUES(1,true,NULL),(2,false,NULL);
      INSERT INTO media_item_genres VALUES(1,1),(2,2);`);
    const base = { enabledMediaTypeCodes: ["game", "film"], page: 1, pageSize: 24, searchQuery: "" };
    const page = await getPublicPlatformsPage(base);
    assert.deepEqual(page.items.map(row => [row.slug, row.mediaItemsCount]), [["hedgehog", 1], ["mac", 1], ["pc", 2]]);
    assert.deepEqual((await getPublicPlatformsPage({ ...base, enabledMediaTypeCodes: ["film"] })).items, []);
    assert.deepEqual((await getPublicPlatformsPage({ ...base, enabledMediaTypeCodes: [] })).items, []);
    assert.deepEqual((await getPublicPlatformsPage({ ...base, searchQuery: "  ЕЖ  " })).items.map(row => row.slug), ["hedgehog"]);
    assert.equal(await getActivePlatformBySlug("hidden"), null);
    assert.equal(await getActivePlatformBySlug("missing"), null);
    assert.equal((await getActivePlatformBySlug("pc"))?.id, 1);
    assert.equal((await searchArchivePlatformMatches("pc", ["game"])).totalCount, 1);
    assert.deepEqual(await searchArchivePlatformMatches("pc", ["film"]), { items: [], totalCount: 0 });
    const filters = { authorRatingFilter: "all" as const, enabledMediaTypeCodes: ["film", "game"], searchQuery: "", yearFilter: null, yearMode: "release" as const, platformId: 1 };
    assert.deepEqual(await getCatalogMediaTypeCounts(filters), [{ mediaType: "game", count: 2 }]);
    assert.deepEqual(await getCatalogMediaTypeCounts({ ...filters, genreId: 1 }), [{ mediaType: "game", count: 1 }]);
    assert.deepEqual(await getCatalogMediaTypeCounts({ ...filters, genreId: 2 }), []);
    assert.deepEqual(await getCatalogMediaTypeCounts({ ...filters, enabledMediaTypeCodes: ["film"] }), []);
    assert.deepEqual(await getCatalogMediaTypeCounts({ ...filters, platformId: 3 }), []);
    assert.equal((await getCatalogReleaseYearBounds(["film", "game"], undefined, undefined, 1)).minReleaseYear, 1995);
    assert.equal((await getCatalogReleaseYearBounds(["film", "game"], 1, undefined, 1)).minReleaseYear, 2001);
    assert.equal((await getCatalogReleaseYearBounds(["film"], undefined, undefined, 1)).minReleaseYear, null);
  } finally {
    await client.unsafe(`DROP SCHEMA IF EXISTS ${schema} CASCADE`);
    await client.end();
  }
});
