import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { describe, it } from "node:test";

const querySource = readFileSync("src/db/queries/franchises.ts", "utf8");
const catalogPageSource = readFileSync("src/app/series/page.tsx", "utf8");
const searchSource = readFileSync("src/app/series/series-search.tsx", "utf8");
const seriesPageSource = readFileSync("src/app/series/[code]/page.tsx", "utf8");
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
  it("renders the paginated roots as a recursive tree with counts and empty states", () => {
    assert.match(catalogPageSource, /function SeriesTree\(/);
    assert.match(
      catalogPageSource,
      /series\.children\.length > 0[\s\S]*<SeriesTree nodes=\{series\.children\} depth=\{depth \+ 1\}/,
    );
    assert.match(catalogPageSource, /<SeriesTree nodes=\{seriesPage\.items\} \/>/);
    assert.match(
      catalogPageSource,
      /SERIES_PAGE_SIZE_OPTIONS = \[24, 48, 72\][\s\S]*DEFAULT_SERIES_PAGE_SIZE = 24/,
    );
    assert.match(
      catalogPageSource,
      /getEnabledMediaTypeCodes\(currentAuthor\?\.id\)[\s\S]*getPublishedFranchisesPage\(\{[\s\S]*enabledMediaTypeCodes,[\s\S]*page: parsePage\(params\.page\),[\s\S]*pageSize,[\s\S]*searchQuery/,
    );
    assert.match(catalogPageSource, /seriesPage\.items\.length === 0[\s\S]*По вашему запросу серии не найдены\.[\s\S]*Пока в архиве нет серий\./);
    assert.match(catalogPageSource, /href=\{`\/series\/\$\{series\.code\}`\}/);
    assert.match(catalogPageSource, /formatMediaItemsCount\(series\.mediaItemsCount\)/);
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
    assert.match(pageQuerySource, /const paginationTotalCount = tree\.length/);
    assert.match(
      pageQuerySource,
      /const items = tree\.slice\(offset, offset \+ input\.pageSize\)/,
    );
    assert.match(pageQuerySource, /totalCount: countNodes\(tree\)/);
    assert.doesNotMatch(pageQuerySource, /flattenTree/);
    assert.doesNotMatch(pageQuerySource, /\.limit\(|\.offset\(/);
    assert.match(pageQuerySource, /pageSize: input\.pageSize,[\s\S]*paginationTotalCount,[\s\S]*totalCount: countNodes\(tree\),[\s\S]*totalPages/);
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

  it("links the series detail breadcrumb through the full catalog", () => {
    assert.match(
      seriesPageSource,
      /href="\/"[\s\S]*Главная[\s\S]*href="\/archive"[\s\S]*Архив[\s\S]*href="\/series"[\s\S]*Все серии[\s\S]*aria-current="page"[\s\S]*\{franchise\.title\}/,
    );
    assert.match(catalogPageSource, /href="\/"[\s\S]*Главная[\s\S]*href="\/archive"[\s\S]*Архив/);
    assert.match(querySource, /const visitedParentIds = new Set\(\[franchise\.id\]\)/);
    assert.match(querySource, /while \(parentId && !visitedParentIds\.has\(parentId\)\)/);
    assert.match(seriesPageSource, /parentBreadcrumbs\.map\(\(parent\) => \(/);
    assert.match(seriesPageSource, /href=\{`\/series\/\$\{parent\.code\}`\}/);
    assert.match(seriesPageSource, /Все серии[\s\S]*parentBreadcrumbs\.map[\s\S]*aria-current="page"/);
    assert.match(seriesPageSource, /<ol className="flex min-w-0 flex-wrap items-center gap-x-2 gap-y-1">/);
    assert.doesNotMatch(seriesPageSource, /flex-1 truncate text-stone-800/);
  });

  it("shows the current series branch before its media items when it has descendants", () => {
    assert.match(querySource, /export async function getPublishedFranchiseBranch\([\s\S]*enabledMediaTypeCodes/);
    assert.match(querySource, /getPublishedFranchiseTree\("", enabledMediaTypeCodes\)/);
    assert.match(seriesPageSource, /getPublishedFranchiseBranch\(franchise\.id, enabledMediaTypeCodes\)/);
    assert.match(seriesPageSource, /franchiseBranch && franchiseBranch\.children\.length > 0/);
    assert.match(seriesPageSource, /Серии внутри/);
    assert.match(seriesPageSource, /function getFranchiseDescendants\(nodes: FranchiseBranchNode\[\]\)/);
    assert.match(seriesPageSource, /<ul className="mt-3 flex flex-wrap gap-x-3 gap-y-1/);
    assert.match(seriesPageSource, /getFranchiseDescendants\(franchiseBranch\.children\)\.map/);
    assert.match(seriesPageSource, /<Link[\s\S]*href=\{`\/series\/\$\{child\.code\}`\}[\s\S]*\{child\.title\}/);

    const branchSection = seriesPageSource.indexOf("franchiseBranch && franchiseBranch.children.length > 0");
    const mediaItems = seriesPageSource.indexOf("{items.length === 0 ?");

    assert.notEqual(branchSection, -1);
    assert.notEqual(mediaItems, -1);
    assert.ok(branchSection < mediaItems, "The series branch must precede the media list");
  });
});
