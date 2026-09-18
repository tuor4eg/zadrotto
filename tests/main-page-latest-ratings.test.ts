import assert from "node:assert/strict";
import { existsSync, readFileSync } from "node:fs";
import { describe, it } from "node:test";

const query = readFileSync("src/db/queries/ratings.ts", "utf8");
const page = readFileSync("src/app/page.tsx", "utf8");

describe("main page latest ratings", () => {
  it("selects only the current author's latest ratings with stable ordering", () => {
    assert.match(query, /latestRatings[\s\S]*eq\(ratings\.authorId, authorId\)/);
    assert.match(
      query,
      /latestRatings[\s\S]*orderBy\(desc\(ratings\.updatedAt\), desc\(ratings\.id\)\)[\s\S]*limit\(5\)/,
    );
    assert.match(query, /mediaItemId: mediaItems\.id/);
  });

  it("renders the latest rating as current activity and removes user-facing history", () => {
    assert.match(page, /latestRating: ratingSummary\.latestRatings\[0\] \?\? null/);
    assert.match(page, /getMediaItemTilesByIds\(\[authorHeroStatistics\.latestRating\.mediaItemId\], author\.id\)/);
    assert.match(page, /Последняя оценка/);
    assert.match(page, /grid grid-rows-\[auto_minmax\(0,1fr\)\]/);
    assert.match(page, /latestAchievement \? "pb-5"/);
    assert.match(page, /border-t-2 border-stone-700\/70 pt-4/);
    assert.match(page, /className="size-20 shrink-0[^"\n]*lg:size-\[5\.5rem\]"/);
    assert.match(page, /className="h-28 w-20 shrink-0[^"\n]*lg:h-32 lg:w-\[5\.5rem\]"/);
    assert.match(page, /href=\{`\/media\/\$\{latestAcquaintance\.code\}`\}/);
    assert.doesNotMatch(page, /\/history|Недавно просмотренное|getRecentlyViewed/);
    assert.equal(existsSync("src/app/history/page.tsx"), false);
    assert.equal(existsSync("src/app/history/viewed-at.tsx"), false);
    assert.equal(existsSync("tests/history-page.test.ts"), false);
  });
});
