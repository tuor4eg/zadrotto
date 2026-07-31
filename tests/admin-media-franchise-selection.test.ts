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
    "getAiFranchiseCandidates",
  );

  it("uses the same flat series options as the other media forms", () => {
    assert.match(optionsQuerySource, /id: franchises\.id,[\s\S]*title: franchises\.title/);
    assert.doesNotMatch(optionsQuerySource, /parentIds/);
    assert.doesNotMatch(optionsQuerySource, /path: path\.join/);
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

  it("does not enable the legacy hierarchical mode in the admin media form", () => {
    assert.doesNotMatch(adminMediaFormSource, /hideSelectedAncestors/);
  });
});
