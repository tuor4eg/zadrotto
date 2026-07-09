import assert from "node:assert/strict";
import { describe, it } from "node:test";

import {
  filterCatalogItems,
  matchesSearch,
  matchesYear,
  parseAuthorRatingFilter,
  parseCatalogSort,
  parseCatalogYear,
  parseCatalogYearMode,
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
    releaseYear: 2019,
    currentAuthorScore: 100,
    currentAuthorRatedAt: new Date("2026-02-01T00:00:00Z"),
    currentAuthorFirstExperiencedAt: "2020-01-01",
  },
  {
    id: 2,
    title: "Солярис",
    originalTitle: "Solaris",
    code: "solaris-1972",
    mediaType: "film",
    releaseYear: 1972,
    currentAuthorScore: null,
    currentAuthorRatedAt: null,
    currentAuthorFirstExperiencedAt: null,
  },
  {
    id: 3,
    title: "Подземелье вкусностей",
    originalTitle: "Dungeon Meshi",
    code: null,
    mediaType: "anime",
    releaseYear: 2024,
    currentAuthorScore: 80,
    currentAuthorRatedAt: new Date("2025-03-01T00:00:00Z"),
    currentAuthorFirstExperiencedAt: "2024-01-01",
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
    currentAuthorScore: 70,
    currentAuthorRatedAt: new Date("2026-01-02T00:00:00Z"),
    currentAuthorFirstExperiencedAt: "2001-01-01",
  },
  {
    id: 2,
    title: "Alpha",
    mediaType: "game",
    releaseYear: null,
    averageScore: 95,
    ratingsCount: 1,
    currentAuthorScore: null,
    currentAuthorRatedAt: null,
    currentAuthorFirstExperiencedAt: null,
  },
  {
    id: 3,
    title: "Beta",
    mediaType: "book",
    releaseYear: 1999,
    averageScore: null,
    ratingsCount: 7,
    currentAuthorScore: 90,
    currentAuthorRatedAt: new Date("2026-01-03T00:00:00Z"),
    currentAuthorFirstExperiencedAt: "1999-01-01",
  },
  {
    id: 4,
    title: "Gamma",
    mediaType: "game",
    releaseYear: 1999,
    averageScore: 95,
    ratingsCount: 3,
    currentAuthorScore: 100,
    currentAuthorRatedAt: new Date("2026-01-01T00:00:00Z"),
    currentAuthorFirstExperiencedAt: "1998-01-01",
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

  it("filters by selected year mode", () => {
    assert.deepEqual(
      filterCatalogItems(items, "", "all", "all", 1972, "release").map((item) => item.id),
      [2],
    );
    assert.deepEqual(
      filterCatalogItems(items, "", "all", "all", 2024, "experience").map((item) => item.id),
      [3],
    );
    assert.deepEqual(
      filterCatalogItems(items, "", "all", "all", 2026, "rating").map((item) => item.id),
      [1],
    );
  });
});

describe("parseCatalogSort", () => {
  it("keeps known catalog sort values and falls back to title", () => {
    assert.equal(parseCatalogSort("release_year"), "release_year");
    assert.equal(parseCatalogSort("my_rating_score"), "my_rating_score");
    assert.equal(parseCatalogSort("my_first_experience_year"), "my_first_experience_year");
    assert.equal(parseCatalogSort("unknown"), "title");
    assert.equal(parseCatalogSort(null), "title");
  });
});

describe("parseMediaTypeFilter", () => {
  it("keeps media type values from options and falls back to all", () => {
    const mediaTypes = [
      { code: "game", name: "Игра", description: null },
      { code: "podcast", name: "Подкаст", description: null },
    ];

    assert.equal(parseMediaTypeFilter("game", mediaTypes), "game");
    assert.equal(parseMediaTypeFilter("podcast", mediaTypes), "podcast");
    assert.equal(parseMediaTypeFilter("unknown", mediaTypes), "all");
    assert.equal(parseMediaTypeFilter(null, mediaTypes), "all");
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

describe("parseCatalogYear", () => {
  it("keeps valid years and falls back to an empty filter", () => {
    assert.equal(parseCatalogYear("1972"), 1972);
    assert.equal(parseCatalogYear("1899"), null);
    assert.equal(parseCatalogYear("not-a-year"), null);
    assert.equal(parseCatalogYear(null), null);
  });
});

describe("parseCatalogYearMode", () => {
  it("keeps known year modes and falls back to release year", () => {
    assert.equal(parseCatalogYearMode("release"), "release");
    assert.equal(parseCatalogYearMode("experience"), "experience");
    assert.equal(parseCatalogYearMode("rating"), "rating");
    assert.equal(parseCatalogYearMode("unknown"), "release");
    assert.equal(parseCatalogYearMode(null), "release");
  });
});

describe("matchesYear", () => {
  it("matches release, experience and rating years explicitly", () => {
    assert.equal(matchesYear(items[0], 2019, "release"), true);
    assert.equal(matchesYear(items[0], 2020, "experience"), true);
    assert.equal(matchesYear(items[0], 2026, "rating"), true);
    assert.equal(matchesYear(items[0], 2021, "experience"), false);
    assert.equal(matchesYear(items[1], 2026, "rating"), false);
  });

  it("keeps empty year filter permissive", () => {
    assert.equal(matchesYear(items[1], null, "release"), true);
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

  it("sorts by current author score with empty scores last", () => {
    assert.deepEqual(
      sortCatalogItems(sortableItems, "my_rating_score").map((item) => item.id),
      [4, 3, 1, 2],
    );
    assert.deepEqual(
      sortCatalogItems(sortableItems, "my_rating_score", "asc").map((item) => item.id),
      [1, 3, 4, 2],
    );
  });

  it("sorts by current author first experience year ascending with empty dates last", () => {
    assert.deepEqual(
      sortCatalogItems(sortableItems, "my_first_experience_year").map((item) => item.id),
      [4, 3, 1, 2],
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
