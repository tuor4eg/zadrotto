import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";

import { ArchiveRatingPanel, RatingStars } from "@/app/media-rating-panel";
import { getMediaCarrierFrame } from "@/lib/media/carrier-frame";

function getHiddenPercentages(score: number | null) {
  const markup = renderToStaticMarkup(createElement(RatingStars, { score }));
  return [...markup.matchAll(/clip-path:inset\(0 ([\d.]+)% 0 0\)/g)].map((match) => Number(match[1]));
}

describe("proportional rating stars", () => {
  it("omits left rating icons for both present and absent scores", () => {
    const variants = ["gamepad", "smartphone", "boardgame-meeples", "anime-manga", "book-note", "dvd-menu", "dos-terminal", "nes-hearts", "ps1-memory-card", "roblox-plaque", "steam-achievement", "vhs-poster", "win9x-window", "windvd-aero", "streaming-card"] as const;
    for (const ratingPanelVariant of variants) {
      for (const compact of [false, true]) {
        for (const score of [null, 0, 80]) {
          const markup = renderToStaticMarkup(createElement(ArchiveRatingPanel, {
            compact, ratingPanelVariant, score, ratingsCount: 3, label: "Оценка архива",
          }));
          assert.doesNotMatch(markup, /right-full|data-rating-symbol/, ratingPanelVariant);
        }
      }
    }
  });
  it("omits stars from every archive rating panel in full and compact views", () => {
    const variants = [undefined, "gamepad", "smartphone", "boardgame-meeples", "anime-manga", "book-note", "comic-card", "dvd-menu", "dos-terminal", "film-strip", "modern-tv-guide", "nes-hearts", "ps1-memory-card", "roblox-plaque", "steam-achievement", "streaming-card", "tv-guide", "vhs-poster", "win9x-window", "windvd-aero"] as const;
    for (const ratingPanelVariant of variants) {
      for (const compact of [false, true]) {
        const markup = renderToStaticMarkup(createElement(ArchiveRatingPanel, {
          compact, ratingPanelVariant, score: 83, ratingsCount: 3, label: "Оценка архива",
        }));
        assert.doesNotMatch(markup, /[★☆⭐]/, `${ratingPanelVariant}: compact=${compact}`);
        assert.match(markup, /8\.3/);
      }
    }
  });
  it("uses SVG meeples for board games with proportional filling", () => {
    const frame = getMediaCarrierFrame({ mediaType: "boardgame" });
    assert.equal(frame?.ratingPanelVariant, "boardgame-meeples");
    const markup = renderToStaticMarkup(createElement(RatingStars, { score: 90, variant: "meeple" }));
    assert.doesNotMatch(markup, /★/);
    assert.equal([...markup.matchAll(/data-rating-symbol="meeple"/g)].length, 10);
    assert.match(markup, /clip-path:inset\(0 50% 0 0\)/);
  });
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
