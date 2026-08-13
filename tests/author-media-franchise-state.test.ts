import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { test } from "node:test";

const mediaItemQueriesSource = readFileSync(
  "src/db/queries/media-items.ts",
  "utf8",
);

test("media item relation subqueries correlate with the outer media item", () => {
  assert.match(
    mediaItemQueriesSource,
    /const correlatedMediaItemIdSql = sql<number>`"media_items"\."id"`/,
  );
  assert.doesNotMatch(mediaItemQueriesSource, /franchiseIdsSql\(mediaItems\.id\)/);
  assert.doesNotMatch(mediaItemQueriesSource, /franchiseLinkStatusesSql\(mediaItems\.id\)/);
});
