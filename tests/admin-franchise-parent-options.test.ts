import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";

test("parent options keep the actual title separate from the display path", () => {
  const query = readFileSync("src/db/queries/franchises.ts", "utf8");
  const select = readFileSync("src/components/ui/searchable-franchise-select.tsx", "utf8");
  const form = readFileSync("src/app/admin/(protected)/series/franchise-form.tsx", "utf8");

  assert.match(query, /code: row\.code, id: row\.id, title: row\.title, originalTitle: row\.originalTitle, path: getPath\(row\)/);
  assert.match(select, /searchByTitleOnly/);
  assert.match(select, /\[option\.title, option\.originalTitle, option\.path, option\.code\]/);
  assert.match(select, /option\.path && option\.path !== option\.title/);
  assert.match(form, /<SearchableFranchiseSelect[\s\S]*searchByTitleOnly/);
  assert.match(form, /selectedParent\.path/);
});

test("parent selection searches candidate titles only and excludes the current subtree", () => {
  const query = readFileSync("src/db/queries/franchises.ts", "utf8");
  const select = readFileSync("src/components/ui/searchable-franchise-select.tsx", "utf8");
  const parentOptionsStart = query.indexOf("export async function getAdminFranchiseParentOptions");
  const parentOptionsEnd = query.indexOf("export async function franchiseExistsById", parentOptionsStart);
  const matcherStart = select.indexOf("function matchesSearch");
  const matcherEnd = select.indexOf("export function SearchableFranchiseSelect", matcherStart);

  assert.notEqual(parentOptionsStart, -1);
  assert.notEqual(parentOptionsEnd, -1);
  assert.notEqual(matcherStart, -1);
  assert.notEqual(matcherEnd, -1);

  const parentOptions = query.slice(parentOptionsStart, parentOptionsEnd);
  const matcher = select.slice(matcherStart, matcherEnd);

  assert.match(parentOptions, /excluded\.add\(franchiseId\)/);
  assert.match(
    parentOptions,
    /for \(const row of rows\) \{[\s\S]*while \(parentId\) \{[\s\S]*if \(parentId === franchiseId\) \{ excluded\.add\(row\.id\); break; \}/,
  );
  assert.match(parentOptions, /rows\.filter\(\(row\) => !excluded\.has\(row\.id\)\)/);
  assert.match(matcher, /\[option\.title, option\.originalTitle, option\.path, option\.code\]/);
});
