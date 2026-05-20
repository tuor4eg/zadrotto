import assert from "node:assert/strict";
import { describe, it } from "node:test";

import {
  filterCatalogItems,
  matchesSearch,
  parseAuthorRatingFilter,
  parseCatalogSort,
  parseMediaTypeFilter,
  sortCatalogItems,
  type CatalogFilterItem,
  type CatalogSortItem,
} from "../src/app/media-items-catalog-logic";

type TestCatalogItem = CatalogFilterItem & {
  id: number;
};

const items: TestCatalogItem[] = [
  {
    id: 1,
    title: "Disco Elysium",
    originalTitle: null,
    code: "disco-elysium",
    mediaType: "game",
    currentAuthorScore: 100,
  },
  {
    id: 2,
    title: "Солярис",
    originalTitle: "Solaris",
    code: "solaris-1972",
    mediaType: "film",
    currentAuthorScore: null,
  },
  {
    id: 3,
    title: "Подземелье вкусностей",
    originalTitle: "Dungeon Meshi",
    code: null,
    mediaType: "anime",
    currentAuthorScore: 80,
  },
];

type TestSortableItem = CatalogSortItem & {
  id: number;
};

const sortableItems: TestSortableItem[] = [
  {
    id: 1,
    title: "Zeta",
    mediaType: "film",
    releaseYear: 2001,
    averageScore: 80,
    ratingsCount: 2,
    currentAuthorRatedAt: new Date("2026-01-02T00:00:00Z"),
  },
  {
    id: 2,
    title: "Alpha",
    mediaType: "game",
    releaseYear: null,
    averageScore: 95,
    ratingsCount: 1,
    currentAuthorRatedAt: null,
  },
  {
    id: 3,
    title: "Beta",
    mediaType: "book",
    releaseYear: 1999,
    averageScore: null,
    ratingsCount: 7,
    currentAuthorRatedAt: new Date("2026-01-03T00:00:00Z"),
  },
  {
    id: 4,
    title: "Gamma",
    mediaType: "game",
    releaseYear: 1999,
    averageScore: 95,
    ratingsCount: 3,
    currentAuthorRatedAt: new Date("2026-01-01T00:00:00Z"),
  },
];

describe("matchesSearch", () => {
  it("searches title, original title, and code case-insensitively", () => {
    assert.equal(matchesSearch(items[0], "elysium"), true);
    assert.equal(matchesSearch(items[1], "solar"), true);
    assert.equal(matchesSearch(items[1], "1972"), true);
    assert.equal(matchesSearch(items[2], "disco"), false);
  });

  it("matches every item for an empty normalized query", () => {
    assert.equal(matchesSearch(items[2], ""), true);
  });
});

describe("filterCatalogItems", () => {
  it("filters by trimmed search query across title, original title, and code", () => {
    assert.deepEqual(
      filterCatalogItems(items, "  SOLAR  ", "all", "all").map((item) => item.id),
      [2],
    );
    assert.deepEqual(
      filterCatalogItems(items, "dungeon", "all", "all").map((item) => item.id),
      [3],
    );
    assert.deepEqual(
      filterCatalogItems(items, "disco-elysium", "all", "all").map((item) => item.id),
      [1],
    );
  });

  it("combines search with media type filter", () => {
    assert.deepEqual(
      filterCatalogItems(items, "", "film", "all").map((item) => item.id),
      [2],
    );
    assert.deepEqual(
      filterCatalogItems(items, "solaris", "game", "all").map((item) => item.id),
      [],
    );
  });

  it("filters by current author rating state", () => {
    assert.deepEqual(
      filterCatalogItems(items, "", "all", "rated").map((item) => item.id),
      [1, 3],
    );
    assert.deepEqual(
      filterCatalogItems(items, "", "all", "unrated").map((item) => item.id),
      [2],
    );
    assert.deepEqual(
      filterCatalogItems(items, "solar", "film", "unrated").map((item) => item.id),
      [2],
    );
    assert.deepEqual(
      filterCatalogItems(items, "solar", "film", "rated").map((item) => item.id),
      [],
    );
  });
});

describe("parseCatalogSort", () => {
  it("keeps known catalog sort values and falls back to title", () => {
    assert.equal(parseCatalogSort("release_year"), "release_year");
    assert.equal(parseCatalogSort("my_rating_order"), "my_rating_order");
    assert.equal(parseCatalogSort("unknown"), "title");
    assert.equal(parseCatalogSort(null), "title");
  });
});

describe("parseMediaTypeFilter", () => {
  it("keeps known media type values and falls back to all", () => {
    assert.equal(parseMediaTypeFilter("game"), "game");
    assert.equal(parseMediaTypeFilter("film"), "film");
    assert.equal(parseMediaTypeFilter("unknown"), "all");
    assert.equal(parseMediaTypeFilter(null), "all");
  });
});

describe("parseAuthorRatingFilter", () => {
  it("keeps known author rating filters and falls back to all", () => {
    assert.equal(parseAuthorRatingFilter("rated"), "rated");
    assert.equal(parseAuthorRatingFilter("unrated"), "unrated");
    assert.equal(parseAuthorRatingFilter("unknown"), "all");
    assert.equal(parseAuthorRatingFilter(null), "all");
  });
});

describe("sortCatalogItems", () => {
  it("sorts by title ascending", () => {
    assert.deepEqual(
      sortCatalogItems(sortableItems, "title").map((item) => item.id),
      [2, 3, 4, 1],
    );
  });

  it("sorts by release year ascending with empty years last", () => {
    assert.deepEqual(
      sortCatalogItems(sortableItems, "release_year").map((item) => item.id),
      [3, 4, 1, 2],
    );
  });

  it("sorts by media type order from the shared media types list", () => {
    assert.deepEqual(
      sortCatalogItems(sortableItems, "media_type").map((item) => item.id),
      [2, 4, 1, 3],
    );
  });

  it("sorts by average score descending with empty scores last", () => {
    assert.deepEqual(
      sortCatalogItems(sortableItems, "average_score").map((item) => item.id),
      [2, 4, 1, 3],
    );
  });

  it("sorts by ratings count descending", () => {
    assert.deepEqual(
      sortCatalogItems(sortableItems, "ratings_count").map((item) => item.id),
      [3, 4, 1, 2],
    );
  });

  it("sorts by current author rating time descending", () => {
    assert.deepEqual(
      sortCatalogItems(sortableItems, "my_rating_order").map((item) => item.id),
      [3, 1, 4, 2],
    );
  });

  it("does not mutate the input list", () => {
    const idsBeforeSort = sortableItems.map((item) => item.id);

    sortCatalogItems(sortableItems, "ratings_count");

    assert.deepEqual(
      sortableItems.map((item) => item.id),
      idsBeforeSort,
    );
  });
});
