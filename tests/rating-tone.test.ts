import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { readFileSync } from "node:fs";

import { getRatingTone } from "../src/lib/ratings/tone";

const toneSource = readFileSync("src/lib/ratings/tone.ts", "utf8");

describe("getRatingTone", () => {
  it("uses bad tone for ratings below 5", () => {
    assert.equal(getRatingTone(10), "bad");
    assert.equal(getRatingTone(40), "bad");
    assert.equal(getRatingTone(45), "bad");
  });

  it("uses medium tone for ratings from 5 up to 8", () => {
    assert.equal(getRatingTone(50), "medium");
    assert.equal(getRatingTone(70), "medium");
    assert.equal(getRatingTone(75), "medium");
  });

  it("uses good tone for ratings from 8 through 10", () => {
    assert.equal(getRatingTone(80), "good");
    assert.equal(getRatingTone(100), "good");
  });

  it("uses a separate neutral tone for an empty rating", () => {
    assert.equal(getRatingTone(null), "empty");
  });

  it("defines translucent rating pill surfaces in the shared palette", () => {
    assert.match(toneSource, /--rating-pill-background:rgba\([^)]*,0\.50\)/);
    assert.doesNotMatch(toneSource, /--rating-pill-border/);
    assert.match(toneSource, /RATING_PILL_TONE_CLASS_NAMES/);
  });

  it("uses a 50% border for the author own rating", () => {
    assert.match(toneSource, /--rating-author-border:rgba\([^)]*,0\.50\)/);
    assert.match(toneSource, /border-\[color:var\(--rating-author-border\)\]/);
  });
});
