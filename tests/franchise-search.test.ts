import assert from "node:assert/strict";
import { describe, it } from "node:test";

import { matchesFranchiseSearch } from "../src/lib/franchises/search";

describe("matchesFranchiseSearch", () => {
  it("matches an unfinished multi-word query regardless of spacing in the title", () => {
    assert.equal(matchesFranchiseSearch(["DuckTales"], "duck ta"), true);
    assert.equal(matchesFranchiseSearch(["Duck Tales"], "duck ta"), true);
  });

  it("normalizes repeated whitespace and letter case", () => {
    assert.equal(matchesFranchiseSearch(["Duck Tales"], "  DUCK   TA  "), true);
  });

  it("matches the original title when it differs from the display title", () => {
    assert.equal(matchesFranchiseSearch(["Утиные истории", "DuckTales"], "duck ta"), true);
  });

  it("does not match unrelated text", () => {
    assert.equal(matchesFranchiseSearch(["Darkwing Duck"], "duck ta"), false);
  });
});
