import assert from "node:assert/strict";
import { existsSync, readFileSync } from "node:fs";
import { describe, it } from "node:test";

import {
  parseArchiveRatingComparison,
  parseRatedByAuthorId,
} from "../src/app/media-items-catalog-logic";

const read = (path: string) => readFileSync(path, "utf8");
const archivePage = read("src/app/archive/page.tsx");
const archiveContext = read("src/app/archive/archive-rated-author-context.tsx");
const catalog = read("src/app/media-items-catalog.tsx");
const catalogControls = read("src/app/catalog-header-controls.tsx");
const catalogControlsWithDemo = read("src/components/user-state/catalog-header-controls-with-demo.tsx");
const mediaQueries = read("src/db/queries/media-items.ts");
const mediaTile = read("src/app/media-item-tile.tsx");
const profilePage = read("src/app/users/[id]/page.tsx");
const profileHeader = read("src/app/users/[id]/public-user-header.tsx");

describe("public rating archive", () => {
  it("parses public URL state conservatively", () => {
    assert.equal(parseRatedByAuthorId("42"), 42);
    assert.equal(parseRatedByAuthorId("0"), null);
    assert.equal(parseRatedByAuthorId("1.5"), null);
    assert.equal(parseRatedByAuthorId("invalid"), null);
    assert.equal(parseArchiveRatingComparison(undefined), "mine");
    assert.equal(parseArchiveRatingComparison("invalid"), "mine");
    assert.equal(parseArchiveRatingComparison("average"), "average");
  });

  it("moves the ratings journal into the shared archive", () => {
    assert.match(profilePage, /ratingsHref=\{`\/archive\?ratedBy=\$\{profile\.id\}&sort=my_rating_date`\}/);
    assert.doesNotMatch(profileHeader, />Оценки<\/Link>/);
    assert.equal(existsSync("src/app/users/[id]/ratings/page.tsx"), false);
    assert.match(archivePage, /<ArchiveRatedAuthorContext/);
    assert.match(archiveContext, /<Avatar/);
    assert.match(archiveContext, /Сравнивать с оценкой:/);
    assert.match(archiveContext, />\s*Средней\s*</);
    assert.match(archiveContext, />\s*Моей\s*</);
    assert.doesNotMatch(archiveContext, /totalCount|Количество/);
  });

  it("activates ratedBy only after the existing journal permission check", () => {
    assert.match(archivePage, /getPublicUserProfile\([\s\S]*currentAuthor\?\.id[\s\S]*Boolean\(currentAdminUser\)/);
    assert.match(archivePage, /requestedRatedProfile\?\.canViewJournal \? requestedRatedProfile : null/);
    assert.match(archivePage, /ratedByAuthorId=\{ratedByAuthorId \?\? null\}/);
  });

  it("keeps the viewer and rating owner separate in queries and tiles", () => {
    assert.match(mediaQueries, /ratedByAuthorId\?: number/);
    assert.match(mediaQueries, /currentAuthorRatingExistsCondition\(input\.ratedByAuthorId\)/);
    assert.match(mediaQueries, /currentAuthorScore: currentAuthorScoreSql\(input\.currentAuthorId\)/);
    assert.match(mediaQueries, /ratedByAuthorScore: currentAuthorScoreSql\(input\.ratedByAuthorId\)/);
    assert.match(mediaQueries, /currentAuthorRatingUpdatedAtSql\(ratingSubjectAuthorId\)/);
    assert.match(mediaQueries, /input\.yearMode === "experience"[\s\S]*input\.ratedByAuthorId \? undefined : input\.currentAuthorId/);
    assert.match(mediaQueries, /my_first_experience_year" && currentAuthorId && !ratedByAuthorId/);
    assert.match(catalog, /viewerScore: item\.currentAuthorScore/);
    assert.match(catalog, /score: item\.ratedByAuthorScore/);
    assert.match(mediaTile, /profileRating\?\./);
    assert.match(mediaTile, /formatScore\(comparisonScore\)/);
    assert.match(mediaTile, /formatScore\(profileRating\.score\)/);
    assert.match(mediaTile, /comparisonRatingToneClassName =\s*AVERAGE_RATING_TONE_CLASS_NAMES/);
  });

  it("preserves archive filters and enables owner-based rating controls", () => {
    assert.match(archivePage, /"ratedBy", "compare"/);
    assert.match(catalog, /ratedBy: ratedByAuthorId \? String\(ratedByAuthorId\)/);
    assert.match(catalog, /compare: ratedByAuthorId/);
    assert.match(catalogControls, /ratingSubject \|\| !isAuthorOnlyCatalogSort/);
    assert.match(catalogControls, /ratingSubject && yearFilter !== null/);
    assert.match(catalogControls, /mode !== "experience"/);
    assert.match(catalogControls, /value !== "my_first_experience_year"/);
    assert.match(catalogControlsWithDemo, /ratingSubject=\{personalArchive \|\| props\.ratedByAuthor\}/);
  });

  it("clears the rated author context when searching, like the selected series", () => {
    assert.match(
      catalogControls,
      /nextFilters\.q !== undefined[\s\S]*nextSearchParams\.delete\("series"\)[\s\S]*nextSearchParams\.delete\("ratedBy"\)[\s\S]*nextSearchParams\.delete\("compare"\)[\s\S]*updateFilterParam\(nextSearchParams, "q"/,
    );
  });
});
