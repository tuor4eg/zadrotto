import assert from "node:assert/strict";
import { describe, it } from "node:test";

import {
  formatRatingsCount,
  formatScore,
  parseRatingScoreInput,
  RATING_SCORE_VALUES,
} from "../src/lib/rating-score";

describe("formatScore", () => {
  it("formats stored integer scores without trailing decimal zero", () => {
    assert.equal(formatScore(85), "8.5");
    assert.equal(formatScore(100), "10");
    assert.equal(formatScore(80), "8");
    assert.equal(formatScore(84), "8.4");
  });

  it("keeps empty score explicit", () => {
    assert.equal(formatScore(null), "\u2014");
  });
});

describe("formatRatingsCount", () => {
  it("uses Russian plural forms for ratings count", () => {
    assert.equal(formatRatingsCount(0), "0 оценок");
    assert.equal(formatRatingsCount(1), "1 оценка");
    assert.equal(formatRatingsCount(2), "2 оценки");
    assert.equal(formatRatingsCount(5), "5 оценок");
    assert.equal(formatRatingsCount(11), "11 оценок");
    assert.equal(formatRatingsCount(14), "14 оценок");
    assert.equal(formatRatingsCount(21), "21 оценка");
    assert.equal(formatRatingsCount(22), "22 оценки");
    assert.equal(formatRatingsCount(25), "25 оценок");
  });
});

describe("parseRatingScoreInput", () => {
  it("stores whole ratings as integer tenths", () => {
    assert.equal(parseRatingScoreInput("8"), 80);
    assert.equal(parseRatingScoreInput("10"), 100);
    assert.equal(parseRatingScoreInput("1"), 10);
  });

  it("rejects decimal scores and values outside the whole score range", () => {
    assert.equal(parseRatingScoreInput("0"), null);
    assert.equal(parseRatingScoreInput("0.5"), null);
    assert.equal(parseRatingScoreInput("7,5"), null);
    assert.equal(parseRatingScoreInput("8.5"), null);
    assert.equal(parseRatingScoreInput("11"), null);
  });
});

describe("RATING_SCORE_VALUES", () => {
  it("keeps rating choices in descending whole-score order", () => {
    assert.deepEqual(RATING_SCORE_VALUES.slice(0, 3), [100, 90, 80]);
    assert.equal(RATING_SCORE_VALUES.at(-1), 10);
  });
});
