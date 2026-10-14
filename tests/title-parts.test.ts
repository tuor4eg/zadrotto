import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { isTitlePartReviewable, isTitlePartRateable, getEffectiveRating, getTitlePartLabel, getTitlePartsHeading } from "../src/lib/media/title-parts";
import { getRatingDistributionScore } from "../src/lib/ratings/score";

describe("universal title parts", () => {
  it("uses type labels, provider names and the specials exception", () => {
    assert.equal(getTitlePartLabel({ type: "season", number: 0, name: "Specials" }), "Спецвыпуски");
    assert.equal(getTitlePartLabel({ type: "volume", number: 2 }), "Том 2");
    assert.equal(getTitlePartLabel({ type: "issue", number: 4, name: "  Финал  " }), "Финал");
    assert.equal(getTitlePartLabel({ type: "part", number: 3, name: " " }), "Часть 3");
    assert.equal(getTitlePartsHeading([{ type: "season" }, { type: "season" }]), "Сезоны");
    assert.equal(getTitlePartsHeading([{ type: "issue" }, { type: "volume" }]), "Части");
    assert.equal(getTitlePartsHeading([]), "Части");
  });

  it("allows ratings for numbered parts except season zero", () => {
    assert.equal(isTitlePartRateable({ type: "season", number: 0 }), false);
    assert.equal(isTitlePartReviewable({ type: "season", number: 0 }), false);
    assert.equal(isTitlePartReviewable({ type: "season", number: 1 }), true);
    assert.equal(isTitlePartReviewable({ type: "volume", number: 0 }), true);
    assert.equal(isTitlePartRateable({ type: "season", number: 1 }), true);
    assert.equal(isTitlePartRateable({ type: "volume", number: 0 }), true);
  });

  it("prioritizes the explicit score and preserves a fractional fallback", () => {
    assert.equal(getEffectiveRating(70, [90, 100]), 70);
    assert.equal(getEffectiveRating(null, [90, 100]), 95);
    assert.equal(getEffectiveRating(null, [80, 80, 90]), 250 / 3);
    assert.equal(getEffectiveRating(null, []), null);
    assert.equal(getEffectiveRating(80, []), 80);
  });

  it("buckets fractional votes for histograms without changing their average", () => {
    const effective = getEffectiveRating(null, [80, 80, 90])!;
    assert.equal(getRatingDistributionScore(effective), 80);
    assert.equal(effective, 250 / 3);
    assert.equal(getRatingDistributionScore(85), 90);
    assert.equal(getRatingDistributionScore(10), 10);
    assert.equal(getRatingDistributionScore(100), 100);
  });
});
