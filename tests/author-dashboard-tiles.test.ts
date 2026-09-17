import assert from "node:assert/strict";
import { existsSync, readFileSync } from "node:fs";
import { describe, it } from "node:test";

const dashboardSource = readFileSync("src/app/author/(protected)/page.tsx", "utf8");
const statisticsSource = readFileSync("src/components/author/author-statistics.tsx", "utf8");
const helperSource = readFileSync("src/db/queries/media-item-tiles.ts", "utf8");
const ratingsSource = readFileSync("src/db/queries/ratings.ts", "utf8");
const reviewsSource = readFileSync("src/db/queries/contribution-reviews.ts", "utf8");
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
  it("removes the private statistics dashboard in favor of the profile", () => {
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
    assert.match(dashboardSource, /redirect\("\/author\/profile"\)/);
    assert.doesNotMatch(dashboardSource, /latestMediaItemIds|getMediaItemTilesByIds|latestRatingTiles|latestReviewTiles/);
  });

  it("keeps tile shaping and cover resolution in one reusable data helper", () => {
    assert.match(helperSource, /if \(uniqueMediaItemIds\.length === 0\)\s*\{\s*return \[\]/);
    assert.match(helperSource, /inArray\(mediaItems\.id, uniqueMediaItemIds\)/);
    assert.match(helperSource, /averageScore: mediaItemAverageScoreSql/);
    assert.match(helperSource, /ratingsCount: mediaItemRatingsCountSql/);
    assert.match(helperSource, /leftJoin\(mediaItemRatingStats/);
    assert.doesNotMatch(helperSource, /avg\(\$\{ratings\.score\}\)|count\(distinct \$\{ratings\.id\}\)/);
    assert.match(helperSource, /currentAuthorScore:[\s\S]*ratings\.authorId/);
    assert.match(helperSource, /coverThumbUrl: resolveCoverUrl\(item\.coverThumbUrl\)/);
    assert.match(helperSource, /coverUrl: resolveCoverUrl\(item\.coverUrl\)/);
    assert.doesNotMatch(dashboardSource, /resolveCoverUrl/);
  });

  it("keeps the shared descriptor-driven responsive grid for public statistics", () => {
    assert.equal(existsSync("src/app/main/responsive-tile-grid.tsx"), false);
    assert.match(gridSource, /items: ResponsiveTileDescriptor\[\]/);
    assert.match(gridSource, /visibleItems\.map\(\(descriptor\)/);
    assert.match(
      gridSource,
      /<MediaItemTile[\s\S]*key=\{descriptor\.key\}[\s\S]*currentAuthorScore=\{descriptor\.currentAuthorScore\}[\s\S]*href=\{descriptor\.href\}[\s\S]*item=\{descriptor\.item\}/,
    );
    assert.match(gridSource, /if \(items\.length === 0\)[\s\S]*Здесь пока пусто/);
    assert.match(statisticsSource, /tileGridInitialColumnCount = 3/);
    assert.match(statisticsSource, /tileGridVariant = "top"/);
    assert.match(statisticsSource, /<ResponsiveTileGrid[\s\S]*initialColumnCount=\{tileGridInitialColumnCount\}[\s\S]*items=\{latestRatingTiles\}[\s\S]*variant=\{tileGridVariant\}/);
    assert.match(statisticsSource, /<ResponsiveTileGrid[\s\S]*initialColumnCount=\{tileGridInitialColumnCount\}[\s\S]*items=\{latestReviewTiles\}[\s\S]*variant=\{tileGridVariant\}/);
  });
});
