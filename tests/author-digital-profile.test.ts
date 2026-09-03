import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";

const querySource = readFileSync("src/db/queries/author-digital-profile.ts", "utf8");
const testPageSource = readFileSync("src/app/test/page.tsx", "utf8");
const messageSource = readFileSync("src/lib/main-page/author-research-message.ts", "utf8");

test("builds the author digital profile from visible published records in full series branches", () => {
  assert.match(querySource, /with recursive/);
  assert.match(querySource, /user_rated_items as/);
  assert.match(querySource, /candidate_series as/);
  assert.match(querySource, /candidate_branches as/);
  assert.match(querySource, /child\.parent_id = branch\.descendant_id/);
  assert.match(querySource, /item\.publication_status = \$\{PUBLISHED_PUBLICATION_STATUS\}/);
  assert.match(querySource, /link\.publication_status = \$\{PUBLISHED_PUBLICATION_STATUS\}/);
  assert.match(querySource, /getMediaTypeCodeFilterSql\(sql`item\.media_type`, enabledMediaTypeCodes\)/);
  assert.match(querySource, /select distinct branch\.series_id, item\.id as media_item_id/);
});

test("ranks strongest, active and unexplored profile dimensions deterministically", () => {
  assert.match(querySource, /rated_count::numeric \/ nullif\(total_count, 0\) desc/);
  assert.match(querySource, /depth desc,[\s\S]*title asc,[\s\S]*id asc/);
  assert.match(querySource, /where rated_count >= 2 and rated_count < total_count/);
  assert.match(querySource, /where stats\.rated_count >= 2/);
  assert.match(
    querySource,
    /having count\(distinct rated\.media_item_id\) < count\(distinct item\.media_item_id\)/,
  );
  assert.match(querySource, /item\.media_type asc/);
});

test("exposes explicit nullable summaries and zero counts and loads the DTO on the new home page", () => {
  assert.match(querySource, /strongestSeries: DigitalProfileSeriesSummary \| null/);
  assert.match(querySource, /bestKnownType: DigitalProfileMediaTypeSummary \| null/);
  assert.match(querySource, /unexploredType: DigitalProfileMediaTypeSummary \| null/);
  assert.match(querySource, /activeSeries: DigitalProfileSeriesSummary \| null/);
  assert.match(querySource, /if \(enabledMediaTypeCodes\.length === 0\) return EMPTY_AUTHOR_DIGITAL_PROFILE/);
  assert.match(testPageSource, /getAuthorDigitalProfile\(author\.id, enabledMediaTypeCodes\)/);
});

test("renders a generated research message in the signed-in home hero", () => {
  assert.match(testPageSource, /getAuthorResearchMessage\(\{/);
  assert.match(testPageSource, /\{researchMessage\?\.title\}/);
  assert.match(testPageSource, /\{researchMessage\?\.body\}/);
  assert.match(testPageSource, /href=\{researchMessage\?\.cta\.href \?\? "\/archive"\}/);
  assert.doesNotMatch(testPageSource, /hasDigitalProfileCopy|activeSeriesIsStrongest/);
  assert.match(messageSource, /MATURE_AUTHOR_RESEARCH_RATINGS_COUNT = 25/);
});
