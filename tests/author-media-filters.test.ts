import assert from "node:assert/strict";
import { describe, it } from "node:test";

import {
  filterAuthorMediaItems,
  normalizeAuthorMediaSearch,
  parseAuthorMediaStatusFilter,
  parseAuthorMediaTypeFilter,
  type AuthorMediaFilterItem,
} from "../src/lib/author-media-filters";

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
  it("parses known filters and falls back to all", () => {
    assert.equal(parseAuthorMediaTypeFilter("game"), "game");
    assert.equal(parseAuthorMediaTypeFilter("unknown"), "all");
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
