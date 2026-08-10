import assert from "node:assert/strict";
import { existsSync, readFileSync } from "node:fs";
import { describe, it } from "node:test";

const dashboardSource = readFileSync("src/app/author/(protected)/page.tsx", "utf8");
const statisticsSource = readFileSync("src/components/author/author-statistics.tsx", "utf8");
const helperSource = readFileSync("src/db/queries/media-item-tiles.ts", "utf8");
const ratingsSource = readFileSync("src/db/queries/ratings.ts", "utf8");
const reviewsSource = readFileSync("src/db/queries/contribution-reviews.ts", "utf8");
const mainPageSource = readFileSync("src/app/page.tsx", "utf8");
const gridSource = readFileSync(
  "src/components/archive/responsive-tile-grid.tsx",
  "utf8",
);

function getExportedFunctionSource(source: string, functionName: string) {
  const match = source.match(
    new RegExp(
      `export async function ${functionName}\\([\\s\\S]*?(?=\\nexport (?:async )?function |$)`,
    ),
  );

  assert.ok(match, `${functionName} should be present`);
  return match[0];
}

describe("author dashboard media tiles", () => {
  it("hydrates unique latest media ids once and restores each summary order", () => {
    const ratingSummarySource = getExportedFunctionSource(
      ratingsSource,
      "getAuthorRatingSummary",
    );
    const reviewSummarySource = getExportedFunctionSource(
      reviewsSource,
      "getAuthorReviewSummary",
    );

    assert.match(
      ratingSummarySource,
      /latestRatings[\s\S]*mediaItemId: mediaItems\.id[\s\S]*\.limit\(5\)/,
    );
    assert.match(
      reviewSummarySource,
      /latestReviews[\s\S]*mediaItemId: mediaItems\.id[\s\S]*\.limit\(5\)/,
    );
    assert.match(
      dashboardSource,
      /const latestMediaItemIds = \[\.\.\.new Set\(\[[\s\S]*summary\.latestRatings\.map[\s\S]*reviewSummary\.latestReviews\.map/,
    );
    assert.equal(
      dashboardSource.match(/getMediaItemTilesByIds\(latestMediaItemIds, author\.id\)/g)?.length,
      1,
    );
    assert.match(dashboardSource, /new Map\(latestMediaItems\.map\(\(item\) => \[item\.id, item\]\)\)/);
    assert.match(dashboardSource, /summary\.latestRatings\.flatMap[\s\S]*latestMediaItemsById\.get\(rating\.mediaItemId\)/);
    assert.match(dashboardSource, /reviewSummary\.latestReviews\.flatMap[\s\S]*latestMediaItemsById\.get\(review\.mediaItemId\)/);
    assert.match(dashboardSource, /href: `\/media\/\$\{item\.code\}`/);
    assert.match(dashboardSource, /href: `\/author\/reviews\/\$\{review\.id\}\/edit`/);
  });

  it("keeps tile shaping and cover resolution in one reusable data helper", () => {
    assert.match(helperSource, /if \(uniqueMediaItemIds\.length === 0\)\s*\{\s*return \[\]/);
    assert.match(helperSource, /inArray\(mediaItems\.id, uniqueMediaItemIds\)/);
    assert.match(helperSource, /avg\(\$\{ratings\.score\}\)::float/);
    assert.match(helperSource, /count\(distinct \$\{ratings\.id\}\)::int/);
    assert.match(helperSource, /currentAuthorScore:[\s\S]*ratings\.authorId/);
    assert.match(helperSource, /coverThumbUrl: resolveCoverUrl\(item\.coverThumbUrl\)/);
    assert.match(helperSource, /coverUrl: resolveCoverUrl\(item\.coverUrl\)/);
    assert.doesNotMatch(dashboardSource, /resolveCoverUrl/);
  });

  it("uses one shared descriptor-driven responsive grid on main and author pages", () => {
    assert.equal(existsSync("src/app/main/responsive-tile-grid.tsx"), false);
    assert.match(gridSource, /items: ResponsiveTileDescriptor\[\]/);
    assert.match(gridSource, /visibleItems\.map\(\(descriptor\)/);
    assert.match(
      gridSource,
      /<MediaItemTile[\s\S]*key=\{descriptor\.key\}[\s\S]*currentAuthorScore=\{descriptor\.currentAuthorScore\}[\s\S]*href=\{descriptor\.href\}[\s\S]*item=\{descriptor\.item\}/,
    );
    assert.match(gridSource, /if \(items\.length === 0\)[\s\S]*Здесь пока пусто/);
    assert.match(
      mainPageSource,
      /function getMainTileDescriptors[\s\S]*currentAuthorScore: item\.currentAuthorScore[\s\S]*href: `\/media\/\$\{item\.code\}`[\s\S]*item,[\s\S]*key: item\.id/,
    );
    assert.match(mainPageSource, /getMainTileDescriptors\(items\)/);
    assert.match(statisticsSource, /<ResponsiveTileGrid[\s\S]*initialColumnCount=\{3\}[\s\S]*items=\{latestRatingTiles\}[\s\S]*variant="top"/);
    assert.match(statisticsSource, /<ResponsiveTileGrid[\s\S]*initialColumnCount=\{3\}[\s\S]*items=\{latestReviewTiles\}[\s\S]*variant="top"/);
    assert.doesNotMatch(mainPageSource, /initialColumnCount=/);
  });
});
