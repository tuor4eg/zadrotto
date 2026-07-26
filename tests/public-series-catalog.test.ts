import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { describe, it } from "node:test";

const querySource = readFileSync("src/db/queries/franchises.ts", "utf8");
const catalogPageSource = readFileSync("src/app/series/page.tsx", "utf8");
const searchSource = readFileSync("src/app/series/series-search.tsx", "utf8");
const seriesPageSource = readFileSync("src/app/series/[code]/page.tsx", "utf8");

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
    assert.match(treeQuerySource, /\.where\(publishedFranchiseCondition\)/);
    assert.match(treeQuerySource, /eq\(mediaItemFranchises\.publicationStatus, PUBLISHED_PUBLICATION_STATUS\)/);
    assert.match(treeQuerySource, /publishedMediaItemCondition/);
    assert.match(treeQuerySource, /if \(normalizedSearch\) \{[\s\S]*matches\.add\(parentId\)/);
    assert.match(treeQuerySource, /const childrenByParentId = new Map<number \| null, number\[\]>\(\)/);
    assert.match(treeQuerySource, /const descendantIds = \[\.\.\.\(childrenByParentId\.get\(id\) \?\? \[\]\)\]/);
    assert.match(treeQuerySource, /matches\.add\(descendantId\)/);
    assert.match(treeQuerySource, /const parent = node\.parentId \? nodes\.get\(node\.parentId\) : undefined/);
    assert.match(treeQuerySource, /if \(parent\) parent\.children\.push\(node\); else roots\.push\(node\);/);
  });

  it("counts each record once across a series subtree", () => {
    assert.match(treeQuerySource, /const mediaIdsByFranchise = new Map<number, Set<number>>\(\)/);
    assert.match(treeQuerySource, /const countItems = \(node: FranchiseTreeNode\): Set<number> => \{/);
    assert.match(treeQuerySource, /for \(const child of node\.children\) for \(const id of countItems\(child\)\) ids\.add\(id\);/);
    assert.match(treeQuerySource, /node\.mediaItemsCount = ids\.size/);
  });
});

describe("public series catalog UI", () => {
  it("renders the nested tree, counts, and empty states without pagination", () => {
    assert.match(catalogPageSource, /function SeriesTree\(/);
    assert.match(catalogPageSource, /<SeriesTree nodes=\{series\.children\} depth=\{depth \+ 1\} \/>/);
    assert.match(catalogPageSource, /getPublishedFranchiseTree\(searchQuery\)/);
    assert.match(catalogPageSource, /series\.length === 0[\s\S]*По вашему запросу серии не найдены\.[\s\S]*Пока в архиве нет серий\./);
    assert.match(catalogPageSource, /href=\{`\/series\/\$\{series\.code\}`\}/);
    assert.match(catalogPageSource, /formatMediaItemsCount\(series\.mediaItemsCount\)/);
    assert.doesNotMatch(catalogPageSource, /PaginationNav|getPublishedFranchisesPage|PAGE_SIZE/);
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
      /href="\/"[\s\S]*Главная[\s\S]*href="\/series"[\s\S]*Все серии[\s\S]*aria-current="page"[\s\S]*\{franchise\.title\}/,
    );
    assert.match(querySource, /const visitedParentIds = new Set\(\[franchise\.id\]\)/);
    assert.match(querySource, /while \(parentId && !visitedParentIds\.has\(parentId\)\)/);
    assert.match(seriesPageSource, /parentBreadcrumbs\.map\(\(parent\) => \(/);
    assert.match(seriesPageSource, /href=\{`\/series\/\$\{parent\.code\}`\}/);
    assert.match(seriesPageSource, /Все серии[\s\S]*parentBreadcrumbs\.map[\s\S]*aria-current="page"/);
  });

  it("shows the current series branch before its media items when it has descendants", () => {
    assert.match(querySource, /export async function getPublishedFranchiseBranch\(franchiseId: number\)/);
    assert.match(querySource, /const buildBranch = \(id: number\): FranchiseBranchNode \| null =>/);
    assert.match(seriesPageSource, /getPublishedFranchiseBranch\(franchise\.id\)/);
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
