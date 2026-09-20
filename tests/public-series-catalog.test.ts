import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { describe, it } from "node:test";

const querySource = readFileSync("src/db/queries/franchises.ts", "utf8");
const catalogPageSource = readFileSync("src/app/series/page.tsx", "utf8");
const catalogSource = readFileSync("src/app/series/series-catalog.tsx", "utf8");
const searchSource = readFileSync("src/app/series/series-search.tsx", "utf8");
const paginationSource = readFileSync("src/components/pagination-nav.tsx", "utf8");

function getFunctionSource(name: string, nextName: string) {
  const start = querySource.indexOf(`export async function ${name}`);
  const end = querySource.indexOf(`export async function ${nextName}`, start);

  assert.notEqual(start, -1, `Missing ${name}`);
  assert.notEqual(end, -1, `Missing boundary after ${name}`);

  return querySource.slice(start, end);
}

describe("public series tree", () => {
  const treeQuerySource = getFunctionSource(
    "getPublishedFranchiseTree",
    "findPublishedFranchiseDuplicateCandidates",
  );

  it("returns only published series and links, preserving each matching branch with parents and descendants", () => {
    assert.match(treeQuerySource, /publishedFranchiseCondition,[\s\S]*visibleIds \? inArray\(franchises\.id, visibleIds\)/);
    assert.match(treeQuerySource, /eq\(mediaItemFranchises\.publicationStatus, PUBLISHED_PUBLICATION_STATUS\)/);
    assert.match(treeQuerySource, /publishedMediaItemCondition/);
    assert.match(treeQuerySource, /getFranchiseSearchVisibleIds\(\{[\s\S]*publishedOnly: true/);
    assert.match(querySource, /with recursive direct_matches as/);
    assert.match(querySource, /inner join ancestors child on child\.parent_id = parent\.id/);
    assert.match(querySource, /inner join descendants parent on child\.parent_id = parent\.id/);
    assert.match(treeQuerySource, /const parent = node\.parentId \? nodes\.get\(node\.parentId\) : undefined/);
    assert.match(treeQuerySource, /if \(parent\) parent\.children\.push\(node\); else roots\.push\(node\);/);
  });

  it("counts each record once across a series subtree", () => {
    assert.match(treeQuerySource, /const mediaIdsByFranchise = new Map<number, Set<number>>\(\)/);
    assert.match(treeQuerySource, /const countItems = \(node: FranchiseTreeNode\): Set<number> => \{/);
    assert.match(treeQuerySource, /for \(const child of node\.children\) for \(const id of countItems\(child\)\) ids\.add\(id\);/);
    assert.match(treeQuerySource, /node\.mediaItemsCount = ids\.size/);
    assert.match(
      treeQuerySource,
      /getMediaTypeCodeFilterSql\(mediaItems\.mediaType, enabledMediaTypeCodes\)/,
    );
    assert.match(treeQuerySource, /const removeEmptyBranches = /);
    assert.match(
      treeQuerySource,
      /return node\.mediaItemsCount > 0 \? \[\{ \.\.\.node, children \}\] : \[\]/,
    );
    assert.match(treeQuerySource, /return removeEmptyBranches\(roots\)/);
  });
});

describe("public series catalog UI", () => {
  it("stretches a short catalog to the available viewport height", () => {
    assert.match(catalogPageSource, /archive-page flex min-h-0 flex-1 flex-col/);
    assert.match(catalogPageSource, /max-w-\[1480px\] flex-1 flex-col gap-3/);
    assert.match(catalogPageSource, /archive-paper archive-panel flex w-full flex-col overflow-hidden/);
    assert.match(catalogPageSource, /mt-auto border-t border-stone-400\/45/);
    assert.doesNotMatch(catalogPageSource, /archive-page min-h-screen/);
  });

  it("renders the paginated roots as a recursive tree with counts and empty states", () => {
    assert.match(catalogSource, /function SeriesTree\(/);
    assert.match(
      catalogSource,
      /visibleChildren\.length > 0[\s\S]*<SeriesTree nodes=\{visibleChildren\} depth=\{depth \+ 1\}/,
    );
    assert.match(catalogPageSource, /<SeriesCatalog[\s\S]*items=\{seriesPage\.items\}[\s\S]*selectedLetter=\{seriesPage\.selectedLetter\}/);
    assert.match(
      catalogPageSource,
      /SERIES_PAGE_SIZE_OPTIONS = \[24, 48, 72\][\s\S]*DEFAULT_SERIES_PAGE_SIZE = 24/,
    );
    assert.match(
      catalogPageSource,
      /getEnabledMediaTypeCodes\(headerState\.author\?\.id\)[\s\S]*getPublishedFranchisesPage\(\{[\s\S]*enabledMediaTypeCodes,[\s\S]*page: parsePage\(params\.page\),[\s\S]*pageSize,[\s\S]*searchQuery/,
    );
    assert.match(catalogPageSource, /seriesPage\.items\.length === 0[\s\S]*По вашему запросу серии не найдены\.[\s\S]*Пока в архиве нет серий\./);
    assert.match(catalogSource, /href=\{`\/archive\?series=\$\{encodeURIComponent\(series\.code\)\}`\}/);
    assert.match(catalogSource, /<SeriesCountBadge count=\{series\.mediaItemsCount\}/);
    assert.match(
      catalogPageSource,
      /<PaginationNav[\s\S]*basePath="\/series"[\s\S]*pageSizeOptions=\{SERIES_PAGE_SIZE_OPTIONS\}[\s\S]*showPageJump[\s\S]*variant="archive"/,
    );
  });

  it("paginates complete root branches without flattening or splitting them", () => {
    const pageQuerySource = getFunctionSource(
      "getPublishedFranchisesPage",
      "getPublishedFranchiseBranch",
    );

    assert.match(pageQuerySource, /enabledMediaTypeCodes: readonly string\[\]/);
    assert.match(
      pageQuerySource,
      /getPublishedFranchiseTree\([\s\S]*input\.searchQuery,[\s\S]*input\.enabledMediaTypeCodes/,
    );
    assert.match(pageQuerySource, /const paginationTotalCount = filteredTree\.length/);
    assert.match(
      pageQuerySource,
      /const items = filteredTree\.slice\(offset, offset \+ input\.pageSize\)/,
    );
    assert.match(pageQuerySource, /totalCount: countNodes\(filteredTree\)/);
    assert.doesNotMatch(pageQuerySource, /flattenTree/);
    assert.doesNotMatch(pageQuerySource, /\.limit\(|\.offset\(/);
    assert.match(pageQuerySource, /pageSize: input\.pageSize,[\s\S]*paginationTotalCount,[\s\S]*totalCount: countNodes\(filteredTree\),[\s\S]*totalPages/);
  });

  it("keeps filters in pagination links and offers page-size and direct-page controls", () => {
    assert.match(paginationSource, /function buildPageHref\([\s\S]*Object\.entries\(searchParams\)/);
    assert.match(paginationSource, /page <= 1[\s\S]*nextSearchParams\.delete\("page"\)/);
    assert.match(paginationSource, /nextSearchParams\.set\("page", String\(page\)\)/);
    assert.match(paginationSource, /HiddenSearchParams exclude=\{\["page", "pageSize"\]\}/);
    assert.match(paginationSource, /totalPages > 1 && showPageJump/);
    assert.match(paginationSource, /aria-label="Пагинация"/);
  });

  it("keeps the debounced search interaction", () => {
    assert.match(catalogPageSource, /import \{ SeriesSearch \} from "\.\/series-search"/);
    assert.match(catalogPageSource, /<SeriesSearch searchQuery=\{searchQuery\} \/>/);
    assert.match(searchSource, /useDebouncedSearchDraft\([\s\S]*searchQuery,[\s\S]*onSearch: handleSearch/);
    assert.match(searchSource, /nextSearchParams\.delete\("page"\)/);
    assert.match(searchSource, /nextSearchParams\.set\("q", normalizedQuery\)/);
  });

});
