import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { describe, it } from "node:test";

const source = readFileSync("src/app/catalog-header-controls.tsx", "utf8");
const globalsSource = readFileSync("src/app/globals.css", "utf8");

describe("catalog header controls", () => {
  it("keeps filter and sort popovers visible in the shared header row", () => {
    assert.match(source, /overflow-visible lg:flex lg:flex-nowrap/);
    assert.doesNotMatch(source, /lg:overflow-hidden/);
    assert.doesNotMatch(source, /isCompact|setIsCompact|compact:/);
  });

  it("renders all icon actions in the header as round buttons", () => {
    assert.match(source, /ArchiveExplorationLauncher[\s\S]*?className="[^"]*rounded-full/);
    assert.match(source, /aria-controls=\{filtersMenuId\}[\s\S]*?className=\{`[^`]*rounded-full/);
    assert.match(source, /compact\s+triggerClassName="rounded-full"/);
  });

  it("uses the admin notification badge appearance for active filters without a count", () => {
    assert.match(
      source,
      /hasActiveFilters[\s\S]*aria-hidden="true"[\s\S]*className="absolute right-0 top-0 size-2\.5 rounded-full bg-red-700 shadow-sm"/,
    );
  });

  it("keeps the filter menu viewport-fixed below the mobile toolbar", () => {
    assert.match(source, /archive-catalog-filter-menu/);
    assert.match(globalsSource, /\.archive-catalog-filter-menu\s*\{[\s\S]*position: fixed/);
    assert.match(globalsSource, /safe-area-inset-(?:top|right|left)/);
    assert.match(
      globalsSource,
      /@media \(min-width: 1024px\)[\s\S]*\.archive-catalog-filter-menu\s*\{[\s\S]*position: absolute/,
    );
  });
});
