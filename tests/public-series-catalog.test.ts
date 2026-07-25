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

describe("public series catalog query", () => {
  const detailQuerySource = getFunctionSource("getFranchiseByCode", "getFranchiseOptions");
  const pageQuerySource = getFunctionSource(
    "getPublishedFranchisesPage",
    "findPublishedFranchiseDuplicateCandidates",
  );

  it("keeps published series with no published media accessible", () => {
    assert.match(detailQuerySource, /publishedFranchiseCondition/);
    assert.doesNotMatch(detailQuerySource, /\bexists\s*\(/);
    assert.match(
      pageQuerySource,
      /\.select\(\{ totalCount: sql<number>`count\(\*\)::int` \}\)[\s\S]*\.from\(franchises\)[\s\S]*\.where\(filterCondition\)/,
    );
  });

  it("uses one title, original title, and code search condition for count and list", () => {
    assert.match(pageQuerySource, /const normalizedSearchQuery = input\.searchQuery\.trim\(\)\.toLowerCase\(\)/);
    assert.match(pageQuerySource, /lower\(\$\{franchises\.title\}\) like/);
    assert.match(pageQuerySource, /lower\(\$\{franchises\.originalTitle\}\) like/);
    assert.match(
      pageQuerySource,
      /sql`\(\'-\' \|\| lower\(\$\{franchises\.code\}\) \|\| \'-\'\) like \$\{codePattern\}`/,
    );
    assert.match(
      pageQuerySource,
      /const filterCondition = and\(publishedFranchiseCondition, searchCondition\)/,
    );
    assert.equal(pageQuerySource.match(/\.where\(filterCondition\)/g)?.length, 2);
  });

  it("counts only published links and media while preserving a zero count", () => {
    assert.match(pageQuerySource, /mediaItemsCount: sql<number>`count\(\$\{mediaItems\.id\}\)::int`/);
    assert.match(
      pageQuerySource,
      /\.leftJoin\([\s\S]*mediaItemFranchises[\s\S]*eq\(mediaItemFranchises\.publicationStatus, PUBLISHED_PUBLICATION_STATUS\)/,
    );
    assert.match(
      pageQuerySource,
      /\.leftJoin\([\s\S]*mediaItems[\s\S]*publishedMediaItemCondition/,
    );
    assert.match(pageQuerySource, /\.where\(filterCondition\)/);
  });

  it("returns stable paginated results and clamps an out-of-range page", () => {
    assert.match(pageQuerySource, /const totalPages = getTotalPages\(totalCount, input\.pageSize\)/);
    assert.match(pageQuerySource, /const page = clampPage\(input\.page, totalPages\)/);
    assert.match(
      pageQuerySource,
      /\.orderBy\(asc\(franchises\.title\), asc\(franchises\.code\), asc\(franchises\.id\)\)/,
    );
    assert.match(pageQuerySource, /\.limit\(input\.pageSize\)/);
    assert.match(pageQuerySource, /\.offset\(getOffset\(page, input\.pageSize\)\)/);
    assert.match(pageQuerySource, /items,[\s\S]*page,[\s\S]*pageSize: input\.pageSize,[\s\S]*totalCount,[\s\S]*totalPages/);
  });
});

describe("public series catalog UI", () => {
  it("renders names, optional original titles, counts, and an empty state", () => {
    assert.match(catalogPageSource, /const PAGE_SIZE = 24/);
    assert.match(catalogPageSource, /const searchQuery = params\.q\?\.trim\(\) \?\? ""/);
    assert.match(catalogPageSource, /getPublishedFranchisesPage\(\{[\s\S]*page: parsePage\(params\.page\),[\s\S]*pageSize: PAGE_SIZE,[\s\S]*searchQuery/);
    assert.match(catalogPageSource, /Все серии/);
    assert.match(catalogPageSource, /href=\{`\/series\/\$\{series\.code\}`\}/);
    assert.match(catalogPageSource, /\{series\.title\}/);
    assert.match(
      catalogPageSource,
      /series\.originalTitle && series\.originalTitle !== series\.title[\s\S]*\{series\.originalTitle\}/,
    );
    assert.match(catalogPageSource, /formatMediaItemsCount\(series\.mediaItemsCount\)/);
    assert.match(
      catalogPageSource,
      /seriesPage\.items\.length === 0[\s\S]*По вашему запросу серии не найдены\.[\s\S]*Пока в архиве нет серий\./,
    );
  });

  it("renders an automatic debounced search above a simple vertical list", () => {
    assert.match(catalogPageSource, /import \{ SeriesSearch \} from "\.\/series-search"/);
    assert.match(
      catalogPageSource,
      /<SeriesSearch searchQuery=\{searchQuery\} \/>[\s\S]*seriesPage\.items\.length === 0/,
    );
    assert.match(searchSource, /^"use client";/);
    assert.match(searchSource, /useDebouncedSearchDraft\(\{[\s\S]*searchQuery,[\s\S]*onSearch: handleSearch/);
    assert.match(searchSource, /nextSearchParams\.delete\("page"\)/);
    assert.match(searchSource, /nextSearchParams\.set\("q", normalizedQuery\)/);
    assert.match(searchSource, /nextSearchParams\.delete\("q"\)/);
    assert.match(
      searchSource,
      /router\.replace\(queryString \? `\$\{pathname\}\?\$\{queryString\}` : pathname, \{[\s\S]*scroll: false/,
    );
    assert.match(searchSource, /onChange=\{\(event\) => setDraft\(event\.target\.value\)\}/);
    assert.match(searchSource, /type="search"/);
    assert.doesNotMatch(searchSource, /<button|\btype="submit"/);
    assert.doesNotMatch(catalogPageSource, /<form|<button|\btype="submit"/);
    assert.match(catalogPageSource, /aria-label="Серии"[\s\S]*divide-y/);
    assert.doesNotMatch(catalogPageSource, /\bgrid-cols-/);
    assert.doesNotMatch(catalogPageSource, /\bmin-h-\d/);
  });

  it("connects the archive pagination to the clamped query result", () => {
    assert.match(
      catalogPageSource,
      /<PaginationNav[\s\S]*basePath="\/series"[\s\S]*itemLabel="серий"[\s\S]*page=\{seriesPage\.page\}[\s\S]*searchParams=\{\{ q: searchQuery \|\| undefined \}\}[\s\S]*totalCount=\{seriesPage\.totalCount\}[\s\S]*totalPages=\{seriesPage\.totalPages\}[\s\S]*variant="archive"/,
    );
  });

  it("links the series detail breadcrumb through the full catalog", () => {
    assert.match(
      seriesPageSource,
      /href="\/"[\s\S]*Главная[\s\S]*href="\/series"[\s\S]*Все серии[\s\S]*aria-current="page"[\s\S]*\{franchise\.title\}/,
    );
  });
});
