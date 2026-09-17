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
  it("shows at most three direct series matches and links excess results to series", () => {
    assert.match(archivePage, /searchArchiveSeriesMatches\(searchQuery, enabledMediaTypeCodes\)/);
    assert.match(franchiseQueries, /export async function searchArchiveSeriesMatches/);
    assert.match(franchiseQueries, /limit = 3/);
    assert.match(franchiseQueries, /matchesNormalizedSearch\(\[series\.title, series\.originalTitle, series\.code\]/);
    assert.match(franchiseQueries, /items: matches\.slice\(0, Math\.max\(0, limit\)\)/);
    assert.match(seriesContext, /totalCount > items\.length/);
    assert.match(seriesContext, /Посмотреть в сериях/);
    assert.doesNotMatch(seriesContext, /formatRecordsCount/);
    assert.doesNotMatch(seriesContext, /item\.mediaItemsCount/);
    assert.match(seriesContext, /itemHref=\{selectionHrefs\[item\.id\]\}/);
    assert.match(seriesContext, /parentHrefs=\{selectionHrefs\}/);
    assert.match(seriesContext, /itemHref \? \([\s\S]*href=\{itemHref\}/);
    assert.match(
      seriesContext,
      /<ul className="[^"]*flex-1 flex-row flex-wrap[^"]*max-sm:w-full max-sm:basis-full/,
    );
    assert.doesNotMatch(seriesContext, /href=\{selectionHrefs\[item\.id\]\}>[\s\S]*<SeriesPath item=\{item\}/);
    assert.match(archivePage, /seriesMatches\.items\.flatMap\(\(series\) => \[[\s\S]*series\.parents\.map\(\(parent\)/);
    assert.match(archivePage, /moreHref=\{`\/series\?q=\$\{encodeURIComponent\(searchQuery\)\}`\}/);
  });

  it("selects a series inside the archive while preserving catalog filters", () => {
    assert.match(archivePage, /series\?: string/);
    assert.match(archivePage, /getFranchiseByCode\(requestedSeriesCode\)/);
    assert.match(
      archivePage,
      /\["mine", "pageSize", "dir", "sort", "type", "year", "yearMode", "ratedBy", "compare"\]/,
    );
    assert.match(archivePage, /nextParams\.set\("series", seriesCode\)/);
    assert.match(archivePage, /const catalogSearchQuery = selectedSeries \? "" : searchQuery/);
    assert.match(seriesContext, /aria-label="Сбросить выбранную серию"/);
    assert.match(seriesContext, /className="grid size-9 shrink-0 place-items-center[^"\n]*" href=\{clearHref\}/);
    assert.match(seriesContext, /relative z-\[60\][^"\n]*overflow-visible/);
    assert.match(seriesContext, /flex min-w-0 flex-wrap items-start gap-3/);
    assert.match(seriesContext, /<Tag className="mt-2 size-5 shrink-0/);
    assert.match(seriesContext, /sm:flex-none sm:max-w-\[40%\]/);
    assert.match(seriesContext, /childSeries\.length > 0 \? "pt-1" : "pt-2"/);
    assert.match(childSeries, /relative min-w-0 flex-1 self-baseline/);
    assert.match(seriesContext, /style=\{\{ overflow: "visible" \}\}/);
    assert.match(seriesContext, /adminCanEdit \? \([\s\S]*<AdminEntityEditLink/);
    assert.match(seriesContext, /href=\{`\/admin\/series\/\$\{item\.id\}\/edit`\}/);
    assert.match(archivePage, /adminCanEdit=\{Boolean\(currentAdminUser\)\}/);
    assert.match(archivePage, /authorCanAddMedia=\{Boolean\(currentAuthor\)\}/);
    assert.match(seriesContext, /authorCanAddMedia \? \([\s\S]*<ArchiveSeriesMediaLinkSearch/);
    assert.doesNotMatch(seriesContext, /ArchiveSelectedSeries\([\s\S]*formatRecordsCount\(totalCount\)/);
    assert.match(seriesContext, /parentHrefs\?\.\[parent\.id\][\s\S]*href=\{parentHrefs\[parent\.id\]\}/);
    assert.match(archivePage, /selectedSeries\.parents\.map\(\(parent\) => \[[\s\S]*getArchiveSeriesHref\(parent\.code\)/);
    assert.match(archivePage, /key=\{selectedSeries\?\.code \?\? "archive-search"\}/);
    assert.match(archivePage, /getPublishedFranchiseBranch\(selectedSeries\.id, enabledMediaTypeCodes\)/);
    assert.match(seriesContext, /<ArchiveChildSeries items=\{childSeries\}/);
    assert.match(seriesContext, /Серии внутри[\s\S]*<ArchiveChildSeries/);
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
    assert.match(catalogControls, /nextSearchParams\.delete\("series"\)[\s\S]*updateFilterParam\(nextSearchParams, "q"/);
  });

  it("applies the published series subtree to items, counts, and pagination", () => {
    assert.match(mediaQueries, /const catalogSeriesCondition/);
    assert.match(mediaQueries, /with recursive published_descendants/);
    assert.match(mediaQueries, /eq\(mediaItemFranchises\.publicationStatus, PUBLISHED_PUBLICATION_STATUS\)/);
    assert.match(mediaQueries, /conditions\.push\(catalogSeriesCondition\(input\.seriesId\)\)/);
    assert.match(archivePage, /getCatalogMediaItems\(\{[\s\S]*seriesId: selectedSeries\?\.id/);
    assert.match(archivePage, /getCatalogMediaTypeCounts\(\{[\s\S]*seriesId: selectedSeries\?\.id/);
    assert.match(catalog, /series: seriesCode \?\? undefined/);
  });
});
