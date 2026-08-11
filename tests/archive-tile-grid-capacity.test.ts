import assert from "node:assert/strict";
import { describe, it } from "node:test";

import {
  ARCHIVE_CATALOG_GRID_CLASS_NAME,
  ARCHIVE_CATALOG_GRID_ROW_COUNT,
  getArchiveCatalogColumnCount,
  getArchiveCatalogPageSize,
  parseArchiveCatalogPageSize,
} from "../src/lib/archive/tile-grid-capacity";

describe("archive tile grid capacity", () => {
  it("matches the archive catalog grid breakpoints", () => {
    assert.equal(getArchiveCatalogColumnCount(360), 3);
    assert.equal(getArchiveCatalogColumnCount(767), 3);
    assert.equal(getArchiveCatalogColumnCount(768), 4);
    assert.equal(getArchiveCatalogColumnCount(1279), 4);
    assert.equal(getArchiveCatalogColumnCount(1280), 6);
  });

  it("fills five full rows for each breakpoint", () => {
    assert.equal(getArchiveCatalogPageSize(360), 15);
    assert.equal(getArchiveCatalogPageSize(900), 20);
    assert.equal(getArchiveCatalogPageSize(1400), 30);
    assert.equal(getArchiveCatalogPageSize(900, ARCHIVE_CATALOG_GRID_ROW_COUNT), 20);
  });

  it("accepts bounded archive page sizes", () => {
    assert.equal(parseArchiveCatalogPageSize(undefined), 20);
    assert.equal(parseArchiveCatalogPageSize("15"), 15);
    assert.equal(parseArchiveCatalogPageSize("20"), 20);
    assert.equal(parseArchiveCatalogPageSize("24"), 24);
    assert.equal(parseArchiveCatalogPageSize("30"), 30);
    assert.equal(parseArchiveCatalogPageSize("14"), 20);
    assert.equal(parseArchiveCatalogPageSize("151"), 20);
  });

  it("exports the same grid classes as the archive catalog", () => {
    assert.match(
      ARCHIVE_CATALOG_GRID_CLASS_NAME,
      /grid-cols-3[\s\S]*md:grid-cols-4[\s\S]*xl:grid-cols-6/,
    );
  });
});
