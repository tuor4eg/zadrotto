import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { describe, it } from "node:test";

const queriesSource = readFileSync("src/db/queries/franchises.ts", "utf8");
const multiSelectSource = readFileSync("src/components/ui/searchable-franchise-multi-select.tsx", "utf8");
const adminMediaFormSource = readFileSync("src/app/admin/(protected)/media/media-form.tsx", "utf8");

function getFunctionSource(name: string, nextName: string) {
  const start = queriesSource.indexOf(`export async function ${name}`);
  const end = queriesSource.indexOf(`export async function ${nextName}`, start);

  assert.notEqual(start, -1, `Missing ${name}`);
  assert.notEqual(end, -1, `Missing boundary after ${name}`);

  return queriesSource.slice(start, end);
}

describe("admin media franchise selection", () => {
  const optionsQuerySource = getFunctionSource(
    "getAdminFranchiseOptions",
    "getPublishedFranchiseOptions",
  );

  it("maps every series to its complete parent path and ancestry ids", () => {
    assert.match(optionsQuerySource, /const parentIds: number\[\] = \[\]/);
    assert.match(optionsQuerySource, /const path = \[row\.title\]/);
    assert.match(optionsQuerySource, /while \(parentId\) \{/);
    assert.match(optionsQuerySource, /parentIds\.unshift\(parent\.id\)/);
    assert.match(optionsQuerySource, /path\.unshift\(parent\.title\)/);
    assert.match(optionsQuerySource, /parentIds,[\s\S]*path: path\.join\(" \/ "\)/);
  });

  it("displays the complete path for selected series", () => {
    assert.match(multiSelectSource, /\{option\.path \?\? option\.title\}/);
    assert.match(multiSelectSource, /aria-label=\{`Убрать серию \$\{option\.path \?\? option\.title\}`\}/);
    assert.match(multiSelectSource, /\[option\.title, option\.path, option\.originalTitle\]/);
  });

  it("hides selected ancestors and removes them when a descendant is added", () => {
    assert.match(multiSelectSource, /const selectedAncestorIds = useMemo\([\s\S]*selectedOptions\.flatMap\(\(option\) => option\.parentIds \?\? \[\]\)/);
    assert.match(multiSelectSource, /!hideSelectedAncestors \|\| selectedIds\.has\(String\(option\.id\)\) \|\| !selectedAncestorIds\.has\(option\.id\)/);
    assert.match(multiSelectSource, /const nextValue = hideSelectedAncestors[\s\S]*value\.filter\(\(selectedId\) => !option\.parentIds\?\.includes\(Number\(selectedId\)\)\)/);
    assert.match(multiSelectSource, /onChange\(\[\.\.\.nextValue, optionId\]\)/);
  });

  it("enables hierarchical deduplication only for the admin media form", () => {
    assert.match(adminMediaFormSource, /<SearchableFranchiseMultiSelect[\s\S]*hideSelectedAncestors/);
  });
});
