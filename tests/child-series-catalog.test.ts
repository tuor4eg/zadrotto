import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";

import {
  filterChildSeries,
  getChildSeriesPreview,
  shouldShowAllChildSeries,
} from "../src/app/series/[code]/child-series";
import type { FranchiseBranchNode } from "../src/db/queries/franchises";

function child(id: number, title = `Серия ${id}`, originalTitle: string | null = null): FranchiseBranchNode {
  return { id, code: `series-${id}`, title, originalTitle, mediaItemsCount: id, children: [] };
}

const pageSource = readFileSync("src/app/series/[code]/children/page.tsx", "utf8");
const catalogSource = readFileSync(
  "src/app/series/[code]/children/child-series-catalog.tsx",
  "utf8",
);
const headerSource = readFileSync("src/app/series/[code]/series-page-header.tsx", "utf8");
const querySource = readFileSync("src/db/queries/franchises.ts", "utf8");

test("shows all 12–17 children and only the first 12 from 18 onward", () => {
  for (const count of [12, 13, 17]) {
    const children = Array.from({ length: count }, (_, index) => child(index + 1));
    assert.equal(shouldShowAllChildSeries(count), true);
    assert.equal(getChildSeriesPreview(children).length, count);
  }

  for (const count of [18, 100]) {
    const children = Array.from({ length: count }, (_, index) => child(index + 1));
    assert.equal(shouldShowAllChildSeries(count), false);
    assert.deepEqual(getChildSeriesPreview(children), children.slice(0, 12));
  }
});

test("filters immediate children by normalized title and original title", () => {
  const children = [
    child(1, "Чужой", "Alien"),
    child(2, "Звёздный путь", "Star Trek"),
  ];

  assert.deepEqual(filterChildSeries(children, "ЧУЖОЙ"), [children[0]]);
  assert.deepEqual(filterChildSeries(children, "звездный"), [children[1]]);
  assert.deepEqual(filterChildSeries(children, "star trek"), [children[1]]);
  assert.deepEqual(filterChildSeries(children, "не найдено"), []);
});

test("reuses the branch DTO and renders a dedicated responsive child catalog", () => {
  assert.match(querySource, /export type FranchiseBranchNode = \{[\s\S]*originalTitle: string \| null;[\s\S]*mediaItemsCount: number/);
  assert.match(pageSource, /getPublishedFranchiseBranch\(franchise\.id, enabledMediaTypeCodes\)/);
  assert.match(pageSource, /const childSeries = franchiseBranch\?\.children \?\? \[\]/);
  assert.doesNotMatch(pageSource, /getMediaItemsByFranchiseId|MediaItemTile|ArchiveNote/);
  assert.match(pageSource, /<SeriesPageHeader[\s\S]*view="children"/);
  assert.match(pageSource, /<ChildSeriesCatalogProvider series=\{childSeries\}/);
  assert.match(pageSource, /<SeriesPageHeader[\s\S]*<ChildSeriesSearch \/>[\s\S]*<ChildSeriesGrid \/>/);
  assert.equal(pageSource.match(/archive-paper archive-panel/g)?.length, 1);
  assert.match(catalogSource, /grid grid-cols-1 gap-2 sm:grid-cols-2 lg:grid-cols-3/);
  assert.match(catalogSource, /formatMediaItemsCount\(child\.mediaItemsCount\)/);
  assert.match(catalogSource, /По вашему запросу дочерние серии не найдены\./);
  assert.match(headerSource, /href=\{`\/series\/\$\{franchise\.code\}`\}/);
  assert.match(headerSource, /Серии внутри/);
});
