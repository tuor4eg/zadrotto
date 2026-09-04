import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { describe, it } from "node:test";

const page = readFileSync("src/app/page.tsx", "utf8");
const excerpt = readFileSync("src/app/main/adaptive-review-excerpt.tsx", "utf8");
const queries = readFileSync("src/db/queries/contribution-reviews.ts", "utf8");

describe("home review card", () => {
  it("sizes the excerpt from available height and keeps the author outside it", () => {
    assert.match(page, /<AdaptiveReviewExcerpt text=\{review\.excerpt\}/);
    assert.match(page, /mt-3 shrink-0 text-xs/);
    assert.match(excerpt, /ResizeObserver/);
    assert.match(excerpt, /container\.clientHeight \/ LINE_HEIGHT_PX/);
    assert.match(excerpt, /WebkitLineClamp: lineCount/);
    assert.doesNotMatch(queries, /normalizedBody\.slice/);
  });
});
