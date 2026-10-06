import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";

import { RatingStars } from "@/app/media-rating-panel";

function getHiddenPercentages(score: number | null) {
  const markup = renderToStaticMarkup(createElement(RatingStars, { score }));
  return [...markup.matchAll(/clip-path:inset\(0 ([\d.]+)% 0 0\)/g)].map((match) => Number(match[1]));
}

describe("proportional rating stars", () => {
  it("fills four and a half stars for a rating of 9", () => {
    assert.deepEqual(getHiddenPercentages(90), [0, 0, 0, 0, 50]);
  });

  it("preserves fractional average scores", () => {
    const hidden = getHiddenPercentages(83);
    assert.deepEqual(hidden.slice(0, 4), [0, 0, 0, 0]);
    assert.ok(Math.abs(hidden[4] - 85) < 0.0001);
  });

  it("keeps empty ratings unfilled and clamps values to five stars", () => {
    assert.deepEqual(getHiddenPercentages(null), [100, 100, 100, 100, 100]);
    assert.deepEqual(getHiddenPercentages(-10), [100, 100, 100, 100, 100]);
    assert.deepEqual(getHiddenPercentages(100), [0, 0, 0, 0, 0]);
    assert.deepEqual(getHiddenPercentages(110), [0, 0, 0, 0, 0]);
  });
});
