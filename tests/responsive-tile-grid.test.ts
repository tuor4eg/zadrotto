import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { describe, it } from "node:test";

import {
  getInitialTileGridColumnCount,
  getTileGridColumnCount,
} from "../src/components/archive/responsive-tile-grid";

const gridSource = readFileSync("src/components/archive/responsive-tile-grid.tsx", "utf8");

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
    assert.equal(getInitialTileGridColumnCount(undefined, "top"), 7);
    assert.equal(getInitialTileGridColumnCount(undefined, "compact"), 6);
    assert.equal(getInitialTileGridColumnCount(3, "top"), 3);
    assert.equal(getInitialTileGridColumnCount(0, "top"), 1);
    assert.equal(getInitialTileGridColumnCount(Number.NaN, "top"), 7);
    assert.match(gridSource, /getInitialTileGridColumnCount\(initialColumnCount, variant\)/);
    assert.match(gridSource, /const visibleItems = items\.slice\(0, columnCount\)/);
    assert.match(gridSource, /repeat\(\$\{columnCount\}, minmax\(0, 1fr\)\)/);
  });
});
