import assert from "node:assert/strict";
import { describe, it } from "node:test";

import {
  filterAuthorMediaItems,
  normalizeAuthorMediaSearch,
  parseAuthorMediaStatusFilter,
  parseAuthorMediaTypeFilter,
  type AuthorMediaFilterItem,
} from "../src/lib/authors/media-filters";

const items: AuthorMediaFilterItem[] = [
  {
    title: "Half-Life",
    originalTitle: null,
    code: "half-life",
    mediaType: "game",
    publicationStatus: "private",
  },
  {
    title: "Матрица",
    originalTitle: "The Matrix",
    code: "the-matrix",
    mediaType: "film",
    publicationStatus: "published",
  },
  {
    title: "Dune",
    originalTitle: null,
    code: "dune",
    mediaType: "book",
    publicationStatus: "submitted",
  },
];

describe("author media filters", () => {
  it("parses media type filters from provided options", () => {
    const mediaTypes = [
      { code: "game", name: "Игра", description: null },
      { code: "podcast", name: "Подкаст", description: null },
    ];

    assert.equal(parseAuthorMediaTypeFilter("game", mediaTypes), "game");
    assert.equal(parseAuthorMediaTypeFilter("podcast", mediaTypes), "podcast");
    assert.equal(parseAuthorMediaTypeFilter("unknown", mediaTypes), "all");
    assert.equal(parseAuthorMediaStatusFilter("private"), "private");
    assert.equal(parseAuthorMediaStatusFilter("published"), "all");
    assert.equal(parseAuthorMediaStatusFilter("unknown"), "all");
  });

  it("normalizes search query", () => {
    assert.equal(normalizeAuthorMediaSearch("  Matrix  "), "matrix");
    assert.equal(normalizeAuthorMediaSearch(undefined), "");
  });

  it("filters by search, media type, and publication status", () => {
    assert.deepEqual(
      filterAuthorMediaItems(items, {
        searchQuery: "matrix",
        mediaType: "film",
        status: "published",
      }).map((item) => item.code),
      [],
    );
    assert.deepEqual(
      filterAuthorMediaItems(items, {
        searchQuery: "",
        mediaType: "all",
        status: "submitted",
      }).map((item) => item.code),
      ["dune"],
    );
    assert.deepEqual(
      filterAuthorMediaItems(items, {
        searchQuery: "half",
        mediaType: "film",
        status: "all",
      }),
      [],
    );
  });

  it("excludes published items from the author cabinet list", () => {
    assert.deepEqual(
      filterAuthorMediaItems(items, {
        searchQuery: "",
        mediaType: "all",
        status: "all",
      }).map((item) => item.code),
      ["half-life", "dune"],
    );
  });
});
