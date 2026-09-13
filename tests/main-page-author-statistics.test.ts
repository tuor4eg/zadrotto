import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { describe, it } from "node:test";

import {
  fillReleaseYearTimeline,
  getCountAxisTicks,
  getReleaseYearAxisLabel,
} from "../src/app/main/home-author-statistics";

const page = readFileSync("src/app/page.tsx", "utf8");
const widget = readFileSync("src/app/main/home-author-statistics.tsx", "utf8");
const widgetWithDemo = readFileSync(
  "src/components/user-state/home-author-statistics-with-demo.tsx",
  "utf8",
);
const existingStatistics = readFileSync("src/components/author/author-statistics.tsx", "utf8");

describe("main page author statistics", () => {
  it("renders a full-width statistics widget through the user-state wrapper", () => {
    assert.match(page, /archive-panel flex items-center overflow-hidden px-4 py-6 sm:px-5 lg:py-7/);
    assert.match(page, /<HomeAuthorStatisticsWithDemo[\s\S]*mediaTypes=\{mediaTypes\.filter\(\(mediaType\) => mediaType\.isEnabled\)\}[\s\S]*serverSummary=\{authorHeroStatistics\?\.ratingSummary \?\? null\}/);
    assert.match(widgetWithDemo, /serverSummary \?\? demoSummary/);
    assert.match(widgetWithDemo, /useDemoProfile\(\)/);
    assert.match(widgetWithDemo, /fetch\("\/api\/demo-home-statistics"/);
    assert.doesNotMatch(widget, /DemoHomeIntro|demo-profile|localStorage/);
    assert.match(widget, /archive-paper archive-panel overflow-hidden/);
    assert.match(widget, /grid gap-5 lg:grid-cols-3 lg:gap-3/);
    assert.match(widget, /className="lg:col-span-2"/);
    assert.equal(widget.match(/mb-3 flex min-h-9 items-center/g)?.length, 2);
    assert.match(widget, /aria-label="Статистика пользователя"/);
    assert.doesNotMatch(widget, /<BarChart3|main-author-statistics-title/);
  });

  it("adds quiz wins to the authenticated hero statistics", () => {
    const hero = readFileSync("src/components/user-state/home-intro-hero.tsx", "utf8");

    assert.match(page, /getAuthorQuizStatistics\(author\.id\)/);
    assert.match(page, /quizWinnerCount: quizStatistics\.winnerCount/);
    assert.match(page, /authorResearchSnapshot && authorHeroStatistics/);
    assert.match(page, /authorHeroStatistics\.quizWinnerCount > 0/);
    assert.match(page, /label: "Побед в квизах"/);
    assert.match(hero, /statisticItems\.length >= 5 \? "sm:grid-cols-5" : "sm:grid-cols-4"/);
  });

  it("duplicates both charts without removing them from author statistics", () => {
    assert.match(widget, /Мои интересы по годам/);
    assert.match(widget, /Распределение оценок/);
    assert.match(widget, /<CalendarRange className=/);
    assert.match(widget, /<ChartNoAxesColumn className=/);
    assert.match(widget, /<ArchiveSelect[\s\S]*ariaLabel="Тип медиа"[\s\S]*options=\{mediaTypeOptions\}/);
    assert.match(widget, /releaseYearMediaTypeDistribution/);
    assert.match(widget, /scoreMediaTypeDistribution/);
    assert.match(widget, /<ScoreDistributionBars items=\{scoreItems\} \/>/);
    assert.match(widget, /onChange=\{setSelectedMediaType\}/);
    assert.match(existingStatistics, /AuthorMediaInterestsPanel/);
    assert.match(existingStatistics, /Распределение оценок/);
  });

  it("renders release-year interests as proportional vertical bars", () => {
    assert.match(widget, /"--year-desktop-width": `\$\{Math\.max\(100, timelineItems\.length \* 2\)\}%`/);
    assert.match(widget, /"--year-mobile-width": `max\(100%, \$\{timelineItems\.length \* 10\}px\)`/);
    assert.match(widget, /grid-cols-\[repeat\(var\(--year-column-count\),minmax\(0,1fr\)\)\]/);
    assert.deepEqual(fillReleaseYearTimeline([
      { count: 1, year: 1999 },
      { count: 3, year: 2002 },
    ]), [
      { count: 1, year: 1999 },
      { count: 0, year: 2000 },
      { count: 0, year: 2001 },
      { count: 3, year: 2002 },
    ]);
    assert.deepEqual(getCountAxisTicks(47), [0, 20, 40, 60]);
    assert.deepEqual(getCountAxisTicks(857), [0, 500, 1000]);
    assert.equal(getReleaseYearAxisLabel(2010, 10, 12, 2011), null);
    assert.equal(getReleaseYearAxisLabel(2011, 11, 12, 2011), 2011);
    assert.equal(getReleaseYearAxisLabel(2010, 10, 14, 2013), 2010);
    assert.equal(getReleaseYearAxisLabel(2000, 0, 2, 2001), null);
    assert.match(widget, /count > 0 \? Math\.max\(3, \(count \/ scaleMaximum\) \* 100\) : 0/);
    assert.match(widget, /border-r border-stone-500\/15/);
    assert.match(widget, /border-t border-stone-500\/10/);
    assert.match(widget, /relative grid h-44 shrink-0 grid-cols-10/);
    assert.doesNotMatch(widget, /relative grid min-h-40 flex-1 grid-cols-10/);
    assert.match(widget, /count > 0 \? "bg-red-950\/70" : "bg-transparent"/);
    assert.match(widget, /style=\{\{ height: `\$\{heightPercent\}%` \}\}/);
    assert.match(widget, /overflow-x-auto[^"]*\[scrollbar-width:none\][^"]*\[&::-webkit-scrollbar\]:hidden/);
    assert.match(widget, /\[direction:rtl\]/);
    assert.match(widget, /event\.pointerType !== "mouse" \|\| event\.button !== 0/);
    assert.match(widget, /setPointerCapture\(event\.pointerId\)/);
    assert.match(widget, /drag\.startScrollLeft === 0 && deltaX < 0 \? -1 : 1/);
    assert.match(widget, /scrollLeft = drag\.startScrollLeft - deltaX \* \(drag\.edgeDirection \?\? 1\)/);
    assert.match(widget, /cursor-grab[^\"]*active:cursor-grabbing/);
    assert.match(widget, /w-\[var\(--year-mobile-width\)\]/);
    assert.match(widget, /\[direction:ltr\]/);
    assert.match(widget, /lg:w-\[var\(--year-desktop-width\)\]/);
    assert.doesNotMatch(widget, /showCount|countLabelStep/);
    assert.doesNotMatch(widget, /<circle|<path/);
  });
});
