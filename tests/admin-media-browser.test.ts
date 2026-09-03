import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { describe, it } from "node:test";

import {
  DEFAULT_ADMIN_MEDIA_BROWSER_PAGE_SIZE,
  parseAdminMediaBrowserQuery,
} from "../src/lib/admin/media-browser";

const querySource = readFileSync("src/db/queries/admin-media-browser.ts", "utf8");
const routeSource = readFileSync("src/app/api/admin/media-browser/route.ts", "utf8");
const componentSource = readFileSync(
  "src/components/admin/admin-media-browser.tsx",
  "utf8",
);

describe("admin media browser query parser", () => {
  it("parses every supported filter and uses the sort-specific default direction", () => {
    const query = parseAdminMediaBrowserQuery(new URLSearchParams({
      minScore: "7,5",
      page: "3",
      pageSize: "48",
      q: "  Дюна  ",
      series: "42",
      seriesScope: "descendants",
      sort: "average_score",
      type: "film",
    }));

    assert.deepEqual(query, {
      direction: "desc",
      franchiseId: 42,
      mediaType: "film",
      minAverageScore: 7.5,
      page: 3,
      pageSize: 48,
      searchQuery: "Дюна",
      seriesScope: "descendants",
      sort: "average_score",
    });
  });

  it("falls back safely for invalid values", () => {
    const query = parseAdminMediaBrowserQuery(new URLSearchParams({
      direction: "sideways",
      minScore: "11",
      page: "-2",
      pageSize: "5000",
      series: "nope",
      seriesScope: "all",
      sort: "unknown",
      type: "Not a type",
    }));

    assert.deepEqual(query, {
      direction: "asc",
      franchiseId: null,
      mediaType: null,
      minAverageScore: null,
      page: 1,
      pageSize: DEFAULT_ADMIN_MEDIA_BROWSER_PAGE_SIZE,
      searchQuery: "",
      seriesScope: "direct",
      sort: "title",
    });
  });
});

describe("admin media browser backend", () => {
  it("uses normalized archive search, public records, rating aggregates and series branches", () => {
    assert.match(querySource, /normalizeSearchText\(searchQuery\)/);
    assert.match(querySource, /containsNormalizedSearchSql\(mediaItems\.title/);
    assert.match(querySource, /mediaItemTitleAliases/);
    assert.match(querySource, /eq\(mediaTypes\.isPubliclyAvailable, true\)/);
    assert.match(querySource, /publishedMediaItemCondition/);
    assert.match(querySource, /mediaItemAverageScoreSql/);
    assert.match(querySource, /mediaItemRatingsCountSql/);
    assert.match(querySource, /with recursive selected_franchise_branch/);
    assert.match(querySource, /child\.parent_id = parent\.id/);
  });

  it("paginates ids before hydrating display data and restores their sorted order", () => {
    const idQueryIndex = querySource.indexOf("const idRows = await db");
    const hydrationIndex = querySource.indexOf("const [itemRows, franchiseRows]");

    assert.ok(idQueryIndex >= 0);
    assert.ok(hydrationIndex > idQueryIndex);
    assert.match(querySource, /const orderedIds = idRows\.map/);
    assert.match(querySource, /orderedIds\.flatMap/);
    assert.match(querySource, /inArray\(mediaItems\.id, orderedIds\)/);
    assert.match(querySource, /resolveCoverUrl\(item\.coverThumbUrl\)/);
  });

  it("exposes the search through an authenticated, collection-agnostic API", () => {
    assert.match(routeSource, /getCurrentAdminUser\(\)/);
    assert.match(routeSource, /status: 401/);
    assert.match(routeSource, /parseAdminMediaBrowserQuery\(searchParams\)/);
    assert.match(routeSource, /searchAdminMediaBrowser\(query\)/);
    assert.doesNotMatch(routeSource, /collection/i);
  });
});

describe("admin media browser UI", () => {
  it("has reusable selection inputs and retains selected DTOs independently of results", () => {
    assert.match(componentSource, /excludedIds\?: readonly number\[\]/);
    assert.match(
      componentSource,
      /onConfirm: \(items: AdminMediaBrowserItem\[\]\) => void/,
    );
    assert.match(componentSource, /new Map<number, AdminMediaBrowserItem>/);
    assert.match(componentSource, /setSelectedItems\(\(current\) =>/);
    assert.match(componentSource, /onConfirm\(selectedAvailableItems\)/);
    assert.match(componentSource, /Выбрать страницу/);
  });

  it("supports all required filters, sorting and responsive result layouts", () => {
    assert.match(componentSource, /Поиск по названию/);
    assert.match(componentSource, /Тип записи/);
    assert.match(componentSource, /Учитывать дочерние серии/);
    assert.match(componentSource, /SearchableFranchiseSelect/);
    assert.match(componentSource, /emptyLabel="Все серии"/);
    assert.match(componentSource, /Минимальная средняя оценка/);
    assert.match(componentSource, /average_score/);
    assert.match(componentSource, /ratings_count/);
    assert.match(componentSource, /release_year/);
    assert.match(componentSource, /hidden md:block/);
    assert.match(componentSource, /md:hidden/);
    assert.match(componentSource, /mediaTypeLabel/);
    assert.match(componentSource, /formatRatingsCount/);
  });
});
