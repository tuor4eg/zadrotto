import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { describe, it } from "node:test";

import { RATING_SCORE_VALUES, formatScore } from "../src/lib/ratings/score";

const source = readFileSync("src/components/author/author-statistics.tsx", "utf8");
const interestsPanelSource = readFileSync(
  "src/app/author/(protected)/author-media-interests-panel.tsx",
  "utf8",
);
const layoutSource = readFileSync("src/app/author/(protected)/layout.tsx", "utf8");
const globalsSource = readFileSync("src/app/globals.css", "utf8");

function getSections() {
  return [...source.matchAll(/<section className="([^"]+)">([\s\S]*?)<\/section>/g)];
}

describe("author dashboard layout", () => {
  it("groups analytics and statistics into one responsive three-card grid", () => {
    const [analyticsSection] = getSections();

    assert.ok(analyticsSection, "analytics section should be present");
    assert.match(source, /author-dashboard flex flex-col gap-3/);
    assert.match(
      analyticsSection[1],
      /grid items-stretch gap-3 lg:grid-cols-\[minmax\(0,1fr\)_minmax\(0,1fr\)_minmax\(14rem,0\.65fr\)\]/,
    );
    assert.match(interestsPanelSource, /Мои интересы/);
    assert.match(analyticsSection[2], /AuthorMediaInterestsPanel[\s\S]*Распределение оценок[\s\S]*Статистика/);
    assert.equal(
      analyticsSection[2].match(
        /<Card className="archive-paper archive-panel h-full">/g,
      )?.length,
      3,
    );
    assert.match(source, /<AuthorMediaInterestsPanel[\s\S]*items=\{interestItems\}[\s\S]*yearlyItems=\{ratingSummary\.releaseYearDistribution\}/);
    assert.doesNotMatch(analyticsSection[1], /(?:sm|md):grid-cols/);
  });

  it("keeps the five existing metrics in one divided statistics list", () => {
    assert.match(source, /const statistics = \[[\s\S]*ratingSummary\.ratingsCount[\s\S]*ratingSummary\.averageScore[\s\S]*ratingSummary\.currentYearRatingsCount[\s\S]*reviewCount[\s\S]*contributionCount/);
    assert.match(source, /divide-y divide-dashed divide-stone-400\/35/);
    assert.match(
      source,
      /statistics\.map[\s\S]*className="flex items-center justify-between gap-4 py-2"/,
    );
    assert.match(source, /\{ Icon: Star[\s\S]*\{ Icon: Gauge[\s\S]*\{ Icon: CalendarCheck[\s\S]*\{ Icon: FileText[\s\S]*\{ Icon: Archive/);
    assert.match(source, /<Icon className="size-4 text-red-950\/65" \/>/);
  });

  it("renders score distribution as one compact ten-column vertical chart", () => {
    assert.deepEqual(
      [...RATING_SCORE_VALUES].reverse().map(formatScore),
      ["1", "2", "3", "4", "5", "6", "7", "8", "9", "10"],
    );
    assert.match(
      source,
      /aria-label="Распределение количества оценок от 1 до 10"[\s\S]*className="flex min-h-0 flex-1 flex-col"[\s\S]*role="img"/,
    );
    assert.match(source, /const scoreDistributionValues = \[\.\.\.RATING_SCORE_VALUES\]\.reverse\(\)/);
    assert.match(
      source,
      /const maxScoreDistributionCount = Math\.max\(1,[\s\S]*ratingSummary\.scoreDistribution\.map/,
    );
    assert.equal(source.match(/scoreDistributionValues\.map\(\(score\) =>/g)?.length, 2);
    assert.match(source, /CardContent className="flex h-full flex-col p-4 sm:px-5 sm:pt-5"/);
    assert.match(source, /className="flex min-h-0 flex-1 flex-col"/);
    assert.match(source, /const barHeightPercent = count > 0[\s\S]*Math\.max\(2, \(count \/ maxScoreDistributionCount\) \* 88\)[\s\S]*: 0/);
    assert.match(source, /relative grid min-h-32 flex-1 grid-cols-10 items-end gap-1 border-b border-stone-400\/50/);
    assert.match(source, /className="relative h-full min-w-0"[\s\S]*bottom: `calc\(\$\{barHeightPercent\}% \+ 0\.125rem\)`[\s\S]*style=\{\{ height: `\$\{barHeightPercent\}%` \}\}/);
    assert.match(source, /count > 0 \? toneClassName : "bg-transparent"/);
    assert.doesNotMatch(source, /bg-stone-100\/80|rounded-sm border-b/);
    assert.doesNotMatch(source, /grid-cols-\[2rem_minmax\(0,1fr\)_2rem\]/);
    assert.doesNotMatch(source, /style=\{\{ width \}\}|grid-rows-\[1rem_minmax/);
  });

  it("uses the main-page heading pattern for all dashboard cards", () => {
    const combinedSource = `${source}\n${interestsPanelSource}`;

    assert.equal(combinedSource.match(/<h2 className="flex min-w-0 items-center gap-2 font-serif text-xl leading-none sm:text-2xl">/g)?.length, 5);
    assert.equal(combinedSource.match(/className="size-5 shrink-0 text-red-950\/70"/g)?.length, 5);
    assert.equal(combinedSource.match(/mb-4 flex[^\"]*border-b border-stone-400\/25[^\"]*pb-3/g)?.length, 5);
    for (const icon of ["Shapes", "ChartNoAxesColumn", "Info", "Star", "FileText"]) {
      assert.match(combinedSource, new RegExp(`<${icon} className=`));
    }
  });

  it("removes the shared paper shell only around the dashboard cards", () => {
    assert.match(layoutSource, /archive-paper-surface archive-panel author-content-shell/);
    assert.match(
      globalsSource,
      /\.author-content-shell:has\(> \.author-dashboard\)\s*\{[\s\S]*padding: 0;[\s\S]*border: 0;[\s\S]*background: none;[\s\S]*box-shadow: none;/,
    );
    assert.equal(
      source.match(/<Card className="archive-paper archive-panel(?: h-full| p-4 sm:px-5 sm:pt-5)">/g)?.length,
      5,
    );
    assert.doesNotMatch(globalsSource, /\.author-content-shell\s*\{/);
  });

  it("keeps the latest ratings and reviews as two independent data panels", () => {
    const sections = getSections();
    const activitySection = sections[1];

    assert.ok(activitySection, "latest activity section should be present");
    assert.match(activitySection[1], /grid gap-3 lg:grid-cols-2/);
    assert.equal(
      activitySection[2].match(
        /<Card className="archive-paper archive-panel p-4 sm:px-5 sm:pt-5">/g,
      )?.length,
      2,
    );
    assert.match(
      activitySection[2],
      /Последние оценки[\s\S]*href=\{ratingsHref\}[\s\S]*ResponsiveTileGrid[\s\S]*initialColumnCount=\{3\}[\s\S]*items=\{latestRatingTiles\}/,
    );
    assert.match(
      activitySection[2],
      /Последние рецензии[\s\S]*href=\{reviewsHref\}[\s\S]*ResponsiveTileGrid[\s\S]*initialColumnCount=\{3\}[\s\S]*items=\{latestReviewTiles\}/,
    );
    assert.equal(activitySection[2].match(/Смотреть всё →/g)?.length, 2);
  });
});
