import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { describe, it } from "node:test";

import {
  compareSeriesAlphabetGroups,
  getSeriesAlphabetGroup,
  getSeriesCountTier,
} from "../src/lib/series/series-alphabet";

const querySource = readFileSync("src/db/queries/franchises.ts", "utf8");
const pageSource = readFileSync("src/app/series/page.tsx", "utf8");
const catalogSource = readFileSync("src/app/series/series-catalog.tsx", "utf8");
const searchSource = readFileSync("src/app/series/series-search.tsx", "utf8");

describe("series alphabet", () => {
  it("groups numeric, Cyrillic, Latin, and other titles", () => {
    assert.equal(getSeriesAlphabetGroup("  12 обезьян"), "0-9");
    assert.equal(getSeriesAlphabetGroup("ёжик в тумане"), "Ё");
    assert.equal(getSeriesAlphabetGroup("bioshock"), "B");
    assert.equal(getSeriesAlphabetGroup("— Без названия"), "#");
    assert.deepEqual(
      ["#", "B", "Я", "0-9", "А"].sort(compareSeriesAlphabetGroups),
      ["0-9", "А", "Я", "B", "#"],
    );
  });

  it("uses the requested count thresholds", () => {
    assert.equal(getSeriesCountTier(4), "small");
    assert.equal(getSeriesCountTier(5), "medium");
    assert.equal(getSeriesCountTier(19), "medium");
    assert.equal(getSeriesCountTier(20), "large");
  });

  it("builds the available alphabet before filtering and pagination", () => {
    const alphabetIndex = querySource.indexOf("const availableLetters");
    const filterIndex = querySource.indexOf("const filteredTree");
    const paginationIndex = querySource.indexOf("const paginationTotalCount");

    assert.ok(alphabetIndex > -1 && alphabetIndex < filterIndex);
    assert.ok(filterIndex < paginationIndex);
    assert.match(querySource, /collectAlphabetGroups\(series\.children\)/);
    assert.match(querySource, /new Set\(collectAlphabetGroups\(tree\)\)/);
    assert.match(querySource, /input\.searchQuery \? undefined : input\.letter/);
    assert.match(
      querySource,
      /const children = filterTreeByLetter\(series\.children, letter\)[\s\S]*\{ \.\.\.series, children \}/,
    );
    assert.match(pageSource, /seriesPage\.availableLetters\.map/);
    assert.match(pageSource, /nextParams\.set\("letter", letter\)/);
    assert.match(searchSource, /nextSearchParams\.delete\("letter"\)/);
    assert.match(catalogSource, /const group = selectedLetter \?\? getSeriesAlphabetGroup/);
  });

  it("renders two columns, tiered badges, and collapses only after eight children", () => {
    assert.match(catalogSource, /COLLAPSED_CHILDREN_COUNT = 8/);
    assert.match(catalogSource, /series\.children\.length > COLLAPSED_CHILDREN_COUNT/);
    assert.match(catalogSource, /isSearchActive[\s\S]*series\.children\.slice/);
    assert.match(catalogSource, /columns-1 gap-6 lg:columns-2/);
    assert.match(catalogSource, /COUNT_BADGE_STYLES\[tier\]/);
    assert.match(catalogSource, /const countTier = getSeriesCountTier\(series\.mediaItemsCount\)/);
    assert.match(catalogSource, /TITLE_STYLES\[countTier\]/);
    assert.match(catalogSource, /isExpanded \? "Свернуть" : `Ещё \$\{hiddenChildrenCount\}`/);
  });
});
