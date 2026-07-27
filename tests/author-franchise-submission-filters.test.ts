import assert from "node:assert/strict";
import { describe, it } from "node:test";

import {
  filterAuthorFranchiseSubmissions,
  parseAuthorFranchiseSubmissionStatusFilter,
  type AuthorFranchiseSubmissionFilterItem,
} from "../src/lib/authors/franchise-submission-filters";

const items: AuthorFranchiseSubmissionFilterItem[] = [
  {
    franchiseCode: "dune",
    franchiseOriginalTitle: null,
    franchiseTitle: "Dune",
    publicationStatus: "submitted",
    mediaItemCode: "dune-part-two",
    mediaItemTitle: "Дюна: Часть вторая",
  },
  {
    franchiseCode: "half-life",
    franchiseOriginalTitle: "Half-Life",
    franchiseTitle: "Half-Life",
    publicationStatus: "published",
  },
  {
    franchiseCode: "matrix",
    franchiseOriginalTitle: "The Matrix",
    franchiseTitle: "Матрица",
    publicationStatus: "rejected",
    mediaItemCode: "the-matrix",
    mediaItemTitle: "Матрица",
  },
];

describe("author franchise submission filters", () => {
  it("accepts only moderation and rejected statuses", () => {
    assert.equal(parseAuthorFranchiseSubmissionStatusFilter("submitted"), "submitted");
    assert.equal(parseAuthorFranchiseSubmissionStatusFilter("rejected"), "rejected");
    assert.equal(parseAuthorFranchiseSubmissionStatusFilter("published"), "all");
    assert.equal(parseAuthorFranchiseSubmissionStatusFilter("private"), "all");
    assert.equal(parseAuthorFranchiseSubmissionStatusFilter("unknown"), "all");
  });

  it("filters by series or media item title and by status", () => {
    assert.deepEqual(
      filterAuthorFranchiseSubmissions(items, { searchQuery: "дюна", status: "submitted" }).map(
        (item) => item.franchiseCode,
      ),
      ["dune"],
    );
    assert.deepEqual(
      filterAuthorFranchiseSubmissions(items, { searchQuery: "matrix", status: "all" }).map(
        (item) => item.franchiseCode,
      ),
      ["matrix"],
    );
    assert.deepEqual(
      filterAuthorFranchiseSubmissions(items, { searchQuery: "", status: "all" }).map(
        (item) => item.franchiseCode,
      ),
      ["dune", "matrix"],
    );
  });
});
