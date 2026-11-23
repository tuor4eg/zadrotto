import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { test } from "node:test";

test("archive wires creator matches to the shared panel and preserves filters without the search query", () => {
  const page = readFileSync("src/app/archive/page.tsx", "utf8");
  const panel = readFileSync("src/app/archive/archive-series-context.tsx", "utf8");
  assert.match(page, /searchArchiveCreatorMatches\(searchQuery, enabledMediaTypeCodes\)/);
  assert.match(page, /searchQuery && !selectedSeries && !selectedGenre && !selectedCreator/);
  assert.match(page, /creators=\{creatorMatches.items\}/);
  assert.match(page, /new URLSearchParams\(preservedCatalogParams\);\s*nextParams.delete\("tag"\);\s*nextParams.set\("creator", creator.slug\)/);
  assert.match(panel, /items.length === 0 && genres.length === 0 && creators.length === 0/);
  assert.match(panel, /Совпадения в создателях:/);
  assert.match(panel, /Посмотреть в создателях/);
  assert.match(page, /creatorMoreHref=\{`\/creators\?q=/);
});

const testUrl = process.env.CREATORS_TEST_DATABASE_URL;

test("creator matches normalize names, include more than three matches and exclude unpublished or unavailable records", { skip: !testUrl }, async () => {
  const schema = `creator_search_${Date.now()}`;
  const url = new URL(testUrl!);
  url.searchParams.set("options", `-c search_path=${schema}`);
  process.env.DATABASE_URL = url.toString();
  const { getDbClient } = await import("../src/db");
  const { searchArchiveCreatorMatches } = await import("../src/db/queries/creators");
  const client = getDbClient();
  try {
    await client.unsafe(`CREATE SCHEMA ${schema}`);
    await client.unsafe(`
      CREATE TABLE creator_types(id integer PRIMARY KEY, code text);
      CREATE TABLE creators(id integer PRIMARY KEY, name text, slug text, type_id integer,name_ru text,name_ru_source text,name_ru_processed boolean default false);
      CREATE TABLE creator_roles(id integer PRIMARY KEY, code text);
      CREATE TABLE media_types(code text PRIMARY KEY, is_publicly_available boolean);
      CREATE TABLE media_items(id integer PRIMARY KEY, media_type text, publication_status text);
      CREATE TABLE entry_creators(entry_id integer, creator_id integer, role_id integer);
      CREATE TABLE creator_relations(source_creator_id integer, target_creator_id integer, relation_type text);
      CREATE TABLE entry_creator_pseudonyms(entry_id integer, creator_id integer, role_id integer);
      INSERT INTO creator_types VALUES (1,'person'),(2,'company');
      INSERT INTO creator_roles VALUES (1,'writer'),(2,'editor');
      INSERT INTO media_types VALUES ('book',true),('film',true);
      INSERT INTO media_items VALUES (1,'book','published'),(2,'book','draft'),(3,'film','published'),(4,'book','published');
      INSERT INTO creators SELECT n, 'Ёж Автор ' || n, 'creator-' || n, 1 FROM generate_series(1,8) n;
      UPDATE creators SET type_id=2 WHERE id=8;
      INSERT INTO entry_creators VALUES (1,1,1),(4,1,1),(1,2,1),(1,3,1),(1,4,1),(2,5,1),(3,6,1),(1,7,2),(1,8,1);
    `);
    const matches = await searchArchiveCreatorMatches("  ЕЖ   автор ", ["book"]);
    assert.equal(matches.totalCount, 4);
    assert.deepEqual(matches.items.map(item => item.id), [1, 2, 3, 4]);
    assert.deepEqual(await searchArchiveCreatorMatches("нет совпадений", ["book"]), { items: [], totalCount: 0 });
    assert.deepEqual(await searchArchiveCreatorMatches("еж", ["film"]), { items: [], totalCount: 0 });
    assert.deepEqual(await searchArchiveCreatorMatches("еж", []), { items: [], totalCount: 0 });
    assert.deepEqual(await searchArchiveCreatorMatches("  ", ["book"]), { items: [], totalCount: 0 });
    await client`UPDATE media_types SET is_publicly_available=false WHERE code='book'`;
    assert.deepEqual(await searchArchiveCreatorMatches("еж", ["book"]), { items: [], totalCount: 0 });
  } finally {
    await client.unsafe(`DROP SCHEMA IF EXISTS ${schema} CASCADE`);
    await client.end();
  }
});
