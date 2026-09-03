import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { describe, it } from "node:test";

const querySource = readFileSync("src/db/queries/franchises.ts", "utf8");
const pageSource = readFileSync("src/app/page.tsx", "utf8");

function getRandomPreviewQuerySource() {
  const start = querySource.indexOf("export async function getRandomPublishedFranchisePreview");
  const end = querySource.indexOf("export async function getPublishedFranchiseOptionById", start);

  assert.notEqual(start, -1, "Missing random published franchise preview query");
  assert.notEqual(end, -1, "Missing random preview query boundary");

  return querySource.slice(start, end);
}

describe("main page random franchise preview", () => {
  const previewQuery = getRandomPreviewQuerySource();

  it("qualifies a random series from distinct published records in its full branch", () => {
    assert.match(previewQuery, /enabledMediaTypeCodes: readonly string\[\]/);
    assert.match(
      previewQuery,
      /root\.publication_status = \$\{PUBLISHED_PUBLICATION_STATUS\}/,
    );
    assert.match(
      previewQuery,
      /eq\(mediaItemFranchises\.publicationStatus, PUBLISHED_PUBLICATION_STATUS\)/,
    );
    assert.match(previewQuery, /publishedMediaItemCondition/);
    assert.match(
      previewQuery,
      /getMediaTypeCodeFilterSql\(mediaItems\.mediaType, input\.enabledMediaTypeCodes\)/,
    );
    assert.match(
      previewQuery,
      /having count\(distinct \$\{mediaItemFranchises\.mediaItemId\}\) >= 5/,
    );
    assert.match(
      previewQuery,
      /with recursive published_franchise_branches/,
    );
    assert.match(previewQuery, /child\.parent_id = branch\.descendant_id/);
    assert.match(
      previewQuery,
      /mediaItemFranchises\.franchiseId\} = branch\.descendant_id/,
    );
    assert.doesNotMatch(
      previewQuery.slice(0, previewQuery.indexOf("if (!franchise)")),
      /publishedFranchiseBranchIdsSql/,
    );
    assert.match(previewQuery, /order by random\(\)/);

    const qualificationEnd = previewQuery.indexOf("if (!franchise)");
    assert.doesNotMatch(previewQuery.slice(0, qualificationEnd), /ratings/);
  });

  it("returns at most twelve fully shaped cards with resolved covers", () => {
    const cardsQuery = previewQuery.slice(previewQuery.indexOf("const rows = await db"));

    assert.match(cardsQuery, /publishedFranchiseBranchIdsSql\(franchise\.id\)/);
    assert.match(
      cardsQuery,
      /eq\(mediaItemFranchises\.publicationStatus, PUBLISHED_PUBLICATION_STATUS\)/,
    );
    assert.match(cardsQuery, /publishedMediaItemCondition/);
    assert.match(
      cardsQuery,
      /getMediaTypeCodeFilterSql\(mediaItems\.mediaType, input\.enabledMediaTypeCodes\)/,
    );

    for (const field of [
      "averageScore",
      "coverThumbUrl",
      "coverUrl",
      "currentAuthorScore",
      "mediaCarrierCode",
      "metadataFacts",
      "ratingsCount",
    ]) {
      assert.match(previewQuery, new RegExp(`${field}:`));
    }
    assert.match(previewQuery, /averageScore: mediaItemAverageScoreSql/);
    assert.match(previewQuery, /ratingsCount: mediaItemRatingsCountSql/);
    assert.match(previewQuery, /leftJoin\(mediaItemRatingStats/);
    assert.doesNotMatch(previewQuery, /avg\(\$\{ratings\.score\}\)|count\(distinct \$\{ratings\.id\}\)/);
    assert.match(previewQuery, /\.limit\(12\)/);
    assert.match(previewQuery, /coverThumbUrl: resolveCoverUrl\(item\.coverThumbUrl\)/);
    assert.match(previewQuery, /coverUrl: resolveCoverUrl\(item\.coverUrl\)/);
  });

  it("renders the full-width streamed section with series and catalog links", () => {
    assert.match(pageSource, /const randomFranchisePromise = getRandomPublishedFranchisePreview\(/);
    assert.match(
      pageSource,
      /<Suspense[\s\S]*<RandomFranchiseSection promise=\{randomFranchisePromise\} \/>/,
    );
    assert.doesNotMatch(pageSource, /await\s+getRandomPublishedFranchisePreview\(/);
    assert.match(pageSource, /href="\/series"/);
    assert.match(pageSource, /href=\{`\/series\/\$\{preview\.franchise\.code\}`\}/);
    assert.match(pageSource, /<Section[\s\S]*?showAllLink=\{false\}[\s\S]*?title=\{preview/);
    assert.match(pageSource, /Случайная серия/);
    assert.match(
      pageSource,
      /ResponsiveTileGrid items=\{getMainTileDescriptors\(preview\.items\)\} variant="top"/,
    );
    assert.match(pageSource, /Серия появится, когда в архиве будет хотя бы пять связанных записей\./);

    const previewSection = pageSource.indexOf("<RandomFranchiseSection");
    const footer = pageSource.indexOf("<ArchiveSiteFooter", previewSection);
    assert.ok(previewSection > -1 && footer > previewSection);
  });
});
