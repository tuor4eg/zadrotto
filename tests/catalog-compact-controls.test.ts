import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { describe, it } from "node:test";

const source = readFileSync("src/app/catalog-header-controls.tsx", "utf8");
const globalsSource = readFileSync("src/app/globals.css", "utf8");

describe("compact desktop catalog controls", () => {
  it("keeps filter and sort popovers visible outside the collapsed header", () => {
    assert.match(source, /lg:overflow-visible/);
    assert.doesNotMatch(source, /lg:overflow-hidden/);
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
