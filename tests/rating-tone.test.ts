import assert from "node:assert/strict";
import { describe, it } from "node:test";

import { getRatingTone } from "../src/lib/ratings/tone";

describe("getRatingTone", () => {
  it("uses bad tone for ratings from 1 through 4", () => {
    assert.equal(getRatingTone(10), "bad");
    assert.equal(getRatingTone(40), "bad");
  });

  it("uses medium tone for ratings from 5 through 7", () => {
    assert.equal(getRatingTone(50), "medium");
    assert.equal(getRatingTone(70), "medium");
  });

  it("uses good tone for ratings from 8 through 10", () => {
    assert.equal(getRatingTone(80), "good");
    assert.equal(getRatingTone(100), "good");
  });

  it("keeps an empty rating neutral", () => {
    assert.equal(getRatingTone(null), "medium");
  });
});
