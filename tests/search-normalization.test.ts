import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";

import {
  matchesNormalizedSearch,
  normalizeSearchText,
} from "../src/lib/search/normalize";

test("normalizes Russian search text consistently", () => {
  assert.equal(normalizeSearchText("  ЁЖИК   в\nТумане  "), "ежик в тумане");
  assert.equal(normalizeSearchText(""), "");
  assert.equal(normalizeSearchText("   "), "");
});

test("matches е and ё in both directions", () => {
  assert.equal(matchesNormalizedSearch(["Ёжик"], "ежик"), true);
  assert.equal(matchesNormalizedSearch(["Ежик"], "ёжик"), true);
  assert.equal(matchesNormalizedSearch(["Совсем другое"], "ёжик"), false);
});

test("SQL helper and trigram indexes use the same normalization expression", () => {
  const sqlHelper = readFileSync("src/db/search.ts", "utf8");
  const migration = readFileSync("drizzle/0056_normalized_trigram_search.sql", "utf8");
  const sharedExpression = String.raw`replace(lower(regexp_replace(btrim(coalesce(`;

  assert.match(sqlHelper, /replace\(lower\(regexp_replace\(btrim\(coalesce\(/);
  assert.equal((migration.match(/USING gin/g) ?? []).length, 10);
  assert.equal((migration.match(/gin_trgm_ops/g) ?? []).length, 10);
  assert.equal((migration.match(/replace\(lower\(regexp_replace\(btrim\(coalesce\(/g) ?? []).length, 10);
  assert.ok(sqlHelper.includes(sharedExpression));
  assert.match(migration, /CREATE EXTENSION IF NOT EXISTS pg_trgm/);
});

test("franchise search resolves matches and branches in SQL before building trees", () => {
  const source = readFileSync("src/db/queries/franchises.ts", "utf8");

  assert.match(source, /with recursive direct_matches as/);
  assert.match(source, /inner join ancestors child/);
  assert.match(source, /inner join descendants parent/);
  assert.match(source, /getFranchiseSearchVisibleIds\(/);
});
