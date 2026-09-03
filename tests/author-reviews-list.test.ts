import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { describe, it } from "node:test";

const pageSource = readFileSync(
  "src/app/author/(protected)/reviews/page.tsx",
  "utf8",
);
const querySource = readFileSync("src/db/queries/contribution-reviews.ts", "utf8");

describe("author reviews list", () => {
  it("uses explicit edit and published-review actions instead of a clickable card", () => {
    assert.match(pageSource, /<article[\s\S]*?href=\{`\/author\/reviews\/\$\{review\.id\}\/edit`\}/);
    assert.match(pageSource, /<Tooltip label="Редактировать">[\s\S]*?<Edit3 \/>/);
    assert.match(
      pageSource,
      /review\.status === "published"[\s\S]*?<Tooltip label="Показать">[\s\S]*?href=\{`\/reviews\/\$\{review\.id\}`\}[\s\S]*?<Eye \/>/,
    );
    assert.doesNotMatch(
      pageSource,
      /<Link[\s\S]*?key=\{review\.id\}[\s\S]*?href=\{`\/author\/reviews\/\$\{review\.id\}\/edit`\}/,
    );
  });

  it("renders compact vertically centered rows with server-side pagination", () => {
    assert.match(pageSource, /reviewsPage\.items\.map/);
    assert.match(pageSource, /flex items-center gap-3 rounded-lg[^"\n]* p-3/);
    assert.match(pageSource, /flex shrink-0 items-center gap-1\.5 self-center/);
    assert.match(pageSource, /<PaginationNav[\s\S]*?basePath="\/author\/reviews"[\s\S]*?totalCount=\{reviewsPage\.totalCount\}/);
    assert.match(querySource, /export async function getAuthorReviews[\s\S]*?count\(\*\)::int[\s\S]*?\.limit\(pageSize\)[\s\S]*?\.offset\(getOffset\(page, pageSize\)\)/);
  });
});
