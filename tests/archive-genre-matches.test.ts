import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { test } from "node:test";
import { ARCHIVE_SEARCH_MATCH_LIMIT } from "../src/lib/archive/search-matches";
test("series and genres share the same match limit", () => {
  assert.equal(ARCHIVE_SEARCH_MATCH_LIMIT,3);
  assert.ok(readFileSync("src/db/queries/franchises.ts","utf8").includes("limit = ARCHIVE_SEARCH_MATCH_LIMIT"));
  assert.ok(readFileSync("src/db/queries/genres.ts","utf8").includes("pageSize: ARCHIVE_SEARCH_MATCH_LIMIT"));
});
test("one panel supports genre-only matches and a second row with overflow link", () => {
  const source=readFileSync("src/app/archive/archive-series-context.tsx","utf8");
  assert.ok(source.includes("items.length === 0 && genres.length === 0"));
  assert.ok(source.indexOf("Совпадения в сериях:") < source.indexOf("Совпадения в жанрах:"));
  assert.ok(source.includes("genreTotalCount > genres.length"));
  assert.ok(source.includes("Посмотреть в жанрах"));
  const page=readFileSync("src/app/archive/page.tsx","utf8");
  assert.ok(page.includes("/genres?q="));
  assert.ok(page.includes("searchQuery && !selectedSeries && !selectedGenre"));
  assert.ok(page.includes('nextParams.set("genre", genre.slug)'));
});
