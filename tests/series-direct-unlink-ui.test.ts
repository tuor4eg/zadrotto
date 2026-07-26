import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";

test("series page shows the unlink control only for direct franchise links", () => {
  const query = readFileSync("src/db/queries/franchises.ts", "utf8");
  const page = readFileSync("src/app/series/[code]/page.tsx", "utf8");
  const tile = readFileSync("src/app/series/[code]/series-media-unlink-tile.tsx", "utf8");

  assert.match(query, /hasDirectFranchiseLink: sql<boolean>`bool_or/);
  assert.match(page, /currentAuthor && item\.hasDirectFranchiseLink/);
  assert.match(tile, /removeAuthorSeriesMediaLinkAction/);
  assert.match(tile, /role="alertdialog"/);
});
