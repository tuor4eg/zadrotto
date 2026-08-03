import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { describe, it } from "node:test";

import { getTileGridColumnCount } from "../src/app/main/responsive-tile-grid";

const gridSource = readFileSync("src/app/main/responsive-tile-grid.tsx", "utf8");

describe("responsive tile grid", () => {
  it("keeps at least three columns after measurement on narrow containers", () => {
    assert.equal(getTileGridColumnCount(1, "top"), 3);
    assert.equal(getTileGridColumnCount(1, "compact"), 3);
  });

  it("uses measured capacity independently of the number of items", () => {
    assert.equal(getTileGridColumnCount(500, "top"), 3);
    assert.equal(getTileGridColumnCount(1000, "top"), 6);
    assert.equal(getTileGridColumnCount(1000, "compact"), 12);
  });

  it("keeps stable initial columns and limits only the rendered items", () => {
    assert.match(gridSource, /useState\(variant === "top" \? 7 : 6\)/);
    assert.match(gridSource, /const visibleItems = items\.slice\(0, columnCount\)/);
    assert.match(gridSource, /repeat\(\$\{columnCount\}, minmax\(0, 1fr\)\)/);
  });
});
