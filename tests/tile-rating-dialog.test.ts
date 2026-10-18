import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { test } from "node:test";

const source = (path: string) => readFileSync(`src/${path}`, "utf8");

test("series tiles share a dialog loaded only after a rating request", () => {
  const scope = source("components/archive/tile-rating-scope.tsx");
  assert.match(scope, /dynamic\(\(\) => import\("\.\/tile-rating-dialog"\)/);
  assert.match(scope, /request \? <LazyTileRatingDialog/);
  assert.match(scope, /onRatingClick=.*openRating\(props\.item\.code, partId\)/);
  const random = source("app/main/random-franchise-section.tsx");
  assert.match(random, /<TileRatingScope>/);
  assert.match(random, /<RateableMediaItemTile/);
  assert.match(random, /<ResponsiveTileGrid[^>]*rateable/);
  assert.match(source("app/media-item-details.tsx"), /<RateableMediaItemTile/);
});

test("dialog data uses the session author's access and preserves their experience date", () => {
  const action = source("app/ratings/dialog-data.ts");
  assert.match(action, /await getCurrentAuthor\(\)/);
  assert.match(action, /getAccessibleMediaTypeCodes\(author\?\.id\)/);
  assert.match(action, /getMediaItemByCode\(code, accessibleMediaTypes, author\?\.id\)/);
  assert.match(action, /currentAuthorFirstExperiencedAt: item\.currentAuthorFirstExperiencedAt/);
  assert.match(action, /currentAuthorFirstExperiencedPrecision: item\.currentAuthorFirstExperiencedPrecision/);
});

test("switching records discards late data and reuses the existing mode-aware rating dialog", () => {
  const dialog = source("components/archive/tile-rating-dialog.tsx");
  assert.match(dialog, /if \(active\) setData\(result\)/);
  assert.match(dialog, /active = false/);
  assert.match(dialog, /<MediaItemRatingDialog \{\.\.\.data\} openRequestKey=\{1\}/);
});

test("season reviews fall back independently for covers and ratings and edit the season", () => {
  const page = source("app/reviews/[id]/page.tsx");
  assert.match(page, /part\.id === review\.partId && part\.type === "season"/);
  assert.match(page, /reviewSeason\?\.coverThumbUrl \?\? reviewSeason\?\.coverUrl/);
  assert.match(page, /coverThumbUrl: seasonCoverUrl \?\? item\.coverThumbUrl/);
  assert.match(page, /averageScore: reviewSeason\.archiveRating \?\? item\.averageScore/);
  assert.match(page, /currentAuthorScore: reviewSeason\.myRating \?\? item\.currentAuthorScore/);
  const action = source("app/ratings/dialog-data.ts");
  assert.match(action, /part\.id === partId && isTitlePartRateable\(part\)/);
  assert.match(action, /partId: part\?\.id \?\? null/);
  assert.match(action, /currentAuthorScore: part \? part\.myRating : item\.currentAuthorScore/);
});
