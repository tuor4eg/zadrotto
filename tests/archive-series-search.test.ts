import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { describe, it } from "node:test";

const read = (file: string) => readFileSync(file, "utf8");
const archivePage = read("src/app/archive/page.tsx");
const seriesContext = read("src/app/archive/archive-series-context.tsx");
const childSeries = read("src/app/archive/archive-child-series.tsx");
const catalogControls = read("src/app/catalog-header-controls.tsx");
const catalog = read("src/app/media-items-catalog.tsx");
const franchiseQueries = read("src/db/queries/franchises.ts");
const mediaQueries = read("src/db/queries/media-items.ts");

describe("archive series search", () => {
  it("fits direct series matches into one row with a link to the series catalog", () => {
    assert.match(archivePage, /searchArchiveSeriesMatches\(searchQuery, enabledMediaTypeCodes\)/);
    assert.match(franchiseQueries, /export async function searchArchiveSeriesMatches/);
    assert.match(franchiseQueries, /limit = ARCHIVE_SEARCH_MATCH_LIMIT/);
    assert.match(franchiseQueries, /matchesNormalizedSearch\(\[series\.title, series\.originalTitle, series\.code\]/);
    assert.match(franchiseQueries, /items: matches\.slice\(0, Math\.max\(0, limit\)\)/);
    assert.doesNotMatch(seriesContext, /totalCount > items\.length/);
    assert.match(seriesContext, /Посмотреть в сериях/);
    assert.doesNotMatch(seriesContext, /formatRecordsCount/);
    assert.doesNotMatch(seriesContext, /item\.mediaItemsCount/);
    assert.match(seriesContext, /itemHref=\{selectionHrefs\[item\.id\]\}/);
    assert.match(seriesContext, /parentHrefs=\{selectionHrefs\}/);
    assert.match(seriesContext, /itemHref \? \([\s\S]*href=\{itemHref\}/);
    assert.match(seriesContext, /<ArchiveMatchList>/);
    assert.match(seriesContext, /archive-panel grid min-w-0 grid-cols-\[minmax\(0,1fr\)\]/);
    assert.match(seriesContext, /sm:grid-cols-\[auto_minmax\(0,1fr\)_auto\]/);
    const matchList = read("src/app/archive/archive-match-list.tsx");
    assert.match(matchList, /overflow-hidden whitespace-nowrap/);
    assert.match(matchList, /ResizeObserver\(fitItems\)/);
    assert.match(matchList, /toggleAttribute\("inert", item\.getBoundingClientRect\(\)\.right > right\)/);
    assert.doesNotMatch(seriesContext, /href=\{selectionHrefs\[item\.id\]\}>[\s\S]*<SeriesPath item=\{item\}/);
    assert.match(archivePage, /seriesMatches\.items\.flatMap\(\(series\) => \[[\s\S]*series\.parents\.map\(\(parent\)/);
    assert.match(archivePage, /moreHref=\{`\/series\?q=\$\{encodeURIComponent\(searchQuery\)\}`\}/);
  });

  it("defaults series to release date and respects explicit sorting", () => {
    assert.match(archivePage, /const parsedSort = selectedSeries && !selectedCreator && params.sort === undefined\s*\? "release_year"/);
    assert.match(archivePage, /const sortDirection = parseCatalogSortDirection\(params.dir \?\? null, sort\)/);
  });

  it("selects a series inside the archive while preserving catalog filters", () => {
    assert.match(archivePage, /series\?: string/);
    assert.match(archivePage, /getFranchiseByCode\(requestedSeriesCode\)/);
    assert.match(
      archivePage,
      /\["tag", "mine", "pageSize", "dir", "sort", "type", "year", "yearMode", "ratedBy", "compare", "creator", "creatorRole", "creatorScope", "platform"\]/,
    );
    assert.match(archivePage, /if \(seriesCode\) nextParams\.delete\("tag"\)/);
    assert.match(archivePage, /nextParams\.set\("series", seriesCode\)/);
    assert.match(archivePage, /const catalogSearchQuery = !selectedCreator && \(selectedGenre \|\| selectedSeries\) \? "" : searchQuery/);

    assert.match(seriesContext, /aria-label="Сбросить выбранную серию"/);
    assert.match(childSeries, /href=\{child.href\}/);
    assert.match(seriesContext, /adminCanEdit \? \([\s\S]*<AdminEntityEditLink/);
    assert.match(seriesContext, /href=\{`\/admin\/series\/\$\{item\.id\}\/edit`\}/);
    assert.match(archivePage, /adminCanEdit=\{Boolean\(currentAdminUser\)\}/);
    assert.match(archivePage, /authorCanAddMedia=\{mayManageFranchises\}/);
    assert.match(seriesContext, /authorCanAddMedia \? \([\s\S]*<ArchiveSeriesMediaLinkSearch/);
    assert.doesNotMatch(seriesContext, /ArchiveSelectedSeries\([\s\S]*formatRecordsCount\(totalCount\)/);
    assert.match(seriesContext, /parentHrefs\?\.\[parent\.id\][\s\S]*href=\{parentHrefs\[parent\.id\]\}/);
    assert.match(archivePage, /selectedSeries\.parents\.map\(\(parent\) => \[[\s\S]*getArchiveSeriesHref\(parent\.code\)/);
    assert.match(archivePage, /key=\{selectedSeries\?\.code \?\? "archive-search"\}/);
    assert.match(archivePage, /getPublishedFranchiseBranch\(selectedSeries\.id, enabledMediaTypeCodes\)/);
    assert.match(seriesContext, /<ArchiveChildSeries items=\{childSeries\}/);
    assert.match(
      seriesContext,
      /flex min-w-0 flex-1[^"]*max-sm:order-last max-sm:w-full max-sm:basis-full/,
    );
    assert.doesNotMatch(childSeries, /data-child-series-label/);
    assert.match(childSeries, /ResizeObserver\(measure\)/);
    assert.match(childSeries, /invisible absolute left-0 top-0 flex w-full[^"\n]*overflow-hidden/);
    assert.doesNotMatch(childSeries, /invisible absolute left-0 top-0 flex w-max/);
    assert.match(childSeries, /items\.slice\(0, visibleCount\)/);
    assert.match(childSeries, /\+ ещё \{hiddenCount\}/);
    assert.match(childSeries, /setExpanded\(true\)/);
    assert.match(childSeries, /Свернуть/);
    assert.doesNotMatch(childSeries, /basis-full/);
    assert.match(childSeries, /rounded-full bg-\[var\(--archive-bg-end\)\][^"\n]*lowercase/);
    assert.match(catalogControls, /nextSearchParams\.delete\("series"\)[\s\S]*nextSearchParams\.delete\("tag"\)[\s\S]*updateFilterParam\(nextSearchParams, "q"/);
  });

  it("applies the published series subtree to items, counts, and pagination", () => {
    assert.match(mediaQueries, /const catalogSeriesCondition/);
    assert.match(mediaQueries, /with recursive published_descendants/);
    assert.match(mediaQueries, /eq\(mediaItemFranchises\.publicationStatus, PUBLISHED_PUBLICATION_STATUS\)/);
    assert.match(mediaQueries, /conditions\.push\(catalogSeriesCondition\(input\.seriesId, input\.includeSeriesDescendants\)\)/);
    assert.match(archivePage, /getCatalogMediaItems\(\{[\s\S]*seriesId: selectedSeries\?\.id/);
    assert.match(archivePage, /getCatalogMediaTypeCounts\(\{[\s\S]*seriesId: selectedSeries\?\.id/);
    assert.match(catalog, /series: seriesCode \?\? undefined/);
  });
});
