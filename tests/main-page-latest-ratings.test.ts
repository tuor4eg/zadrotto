import assert from "node:assert/strict";
import { existsSync, readFileSync } from "node:fs";
import { describe, it } from "node:test";

const query = readFileSync("src/db/queries/main-page.ts", "utf8");
const page = readFileSync("src/app/page.tsx", "utf8");

describe("main page latest ratings", () => {
  it("selects only the current author's latest ratings with stable ordering", () => {
    assert.match(query, /latestRatings: 12/);
    assert.match(
      query,
      /currentAuthorId[\s\S]*exists \([\s\S]*ratings\.authorId} = \$\{currentAuthorId\}/,
    );
    assert.match(
      query,
      /select \$\{ratings\.updatedAt\}[\s\S]*ratings\.authorId} = \$\{currentAuthorId\}[\s\S]*mediaItems\.id\} desc/,
    );
    assert.match(query, /\.limit\(SECTION_SIZES\.latestRatings\)/);
    assert.match(query, /: Promise\.resolve\(\[\]\)/);
    assert.match(query, /latestRatings: latestRatingsPromise\.then\(resolveMediaItems\)/);
    assert.doesNotMatch(query, /randomRows/);
  });

  it("renders the real section and removes user-facing history", () => {
    assert.match(page, /href="\/archive\?sort=my_rating_date&mine=rated"[\s\S]*title="Мои последние оценки"/);
    assert.match(page, /SectionItems promise=\{data\.latestRatings\}/);
    assert.match(page, /Когда вы начнете оценивать и добавлять записи в желаемое/);
    assert.doesNotMatch(page, /\/history|Недавно просмотренное|getRecentlyViewed/);
    assert.equal(existsSync("src/app/history/page.tsx"), false);
    assert.equal(existsSync("src/app/history/viewed-at.tsx"), false);
    assert.equal(existsSync("tests/history-page.test.ts"), false);
  });
});
