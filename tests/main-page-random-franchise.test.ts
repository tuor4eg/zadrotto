import assert from "node:assert/strict"
import { readFileSync } from "node:fs"
import { describe, it } from "node:test"

const querySource = readFileSync("src/db/queries/franchises.ts", "utf8")
const pageSource = readFileSync("src/app/page.tsx", "utf8")
const sectionSource = readFileSync("src/app/main/random-franchise-section.tsx", "utf8")

function getRandomPreviewQuerySource() {
  const start = querySource.indexOf("export async function getRandomPublishedFranchisePreview")
  const end = querySource.indexOf("export async function getPublishedFranchiseOptionById", start)

  assert.notEqual(start, -1, "Missing random published franchise preview query")
  assert.notEqual(end, -1, "Missing random preview query boundary")

  return querySource.slice(start, end)
}

describe("main page random franchise preview", () => {
  const previewQuery = getRandomPreviewQuerySource()

  it("qualifies a random series from distinct published records of that series only", () => {
    assert.match(previewQuery, /enabledMediaTypeCodes: readonly string\[\]/)
    assert.match(previewQuery, /publishedFranchiseCondition/)
    assert.match(
      previewQuery,
      /eq\(mediaItemFranchises\.publicationStatus, PUBLISHED_PUBLICATION_STATUS\)/,
    )
    assert.match(previewQuery, /publishedMediaItemCondition/)
    assert.match(
      previewQuery,
      /getMediaTypeCodeFilterSql\(mediaItems\.mediaType, input\.enabledMediaTypeCodes\)/,
    )
    assert.match(
      previewQuery,
      /having\(sql`count\(distinct \$\{mediaItemFranchises\.mediaItemId\}\) >= 5`\)/,
    )
    assert.match(previewQuery, /eq\(mediaItemFranchises\.franchiseId, franchises\.id\)/)
    assert.match(previewQuery, /eq\(mediaItemFranchises\.franchiseId, franchise\.id\)/)
    assert.doesNotMatch(previewQuery, /published_franchise_branches/)
    assert.doesNotMatch(previewQuery, /publishedFranchiseBranchIdsSql/)
    assert.match(previewQuery, /orderBy\(sql`random\(\)`\)/)

    const qualificationEnd = previewQuery.indexOf("if (!franchise)")
    assert.doesNotMatch(previewQuery.slice(0, qualificationEnd), /ratings/)
  })

  it("returns at most twelve fully shaped cards with resolved covers", () => {
    const cardsQuery = previewQuery.slice(previewQuery.indexOf("const rows = await db"))

    assert.match(cardsQuery, /eq\(mediaItemFranchises\.franchiseId, franchise\.id\)/)
    assert.match(
      cardsQuery,
      /eq\(mediaItemFranchises\.publicationStatus, PUBLISHED_PUBLICATION_STATUS\)/,
    )
    assert.match(cardsQuery, /publishedMediaItemCondition/)
    assert.match(
      cardsQuery,
      /getMediaTypeCodeFilterSql\(mediaItems\.mediaType, input\.enabledMediaTypeCodes\)/,
    )

    for (const field of [
      "averageScore",
      "coverThumbUrl",
      "coverUrl",
      "currentAuthorScore",
      "mediaCarrierCode",
      "metadataFacts",
      "ratingsCount",
    ]) {
      assert.match(previewQuery, new RegExp(`${field}:`))
    }
    assert.match(previewQuery, /averageScore: mediaItemAverageScoreSql/)
    assert.match(previewQuery, /ratingsCount: mediaItemRatingsCountSql/)
    assert.match(previewQuery, /leftJoin\(mediaItemRatingStats/)
    assert.doesNotMatch(previewQuery, /avg\(\$\{ratings\.score\}\)|count\(distinct \$\{ratings\.id\}\)/)
    assert.match(previewQuery, /\.limit\(12\)/)
    assert.match(previewQuery, /coverThumbUrl: resolveCoverUrl\(item\.coverThumbUrl\)/)
    assert.match(previewQuery, /coverUrl: resolveCoverUrl\(item\.coverUrl\)/)
  })

  it("renders the full-width streamed section with the series name as the heading link", () => {
    assert.match(pageSource, /const randomFranchisePromise = getRandomPublishedFranchisePreview\(/)
    assert.match(
      pageSource,
      /<Suspense[\s\S]*<RandomFranchiseSection promise=\{randomFranchisePromise\} \/>/,
    )
    assert.match(pageSource, /<ArchiveFeed items=\{archiveFeed\} \/>[\s\S]*<RandomFranchiseSection/)
    assert.doesNotMatch(pageSource, /await\s+getRandomPublishedFranchisePreview\(/)
    assert.match(sectionSource, /<span className="shrink-0">Случайная серия<\/span>/)
    assert.match(
      sectionSource,
      /<Link[\s\S]*href=\{`\/archive\?series=\$\{encodeURIComponent\(preview\.franchise\.code\)\}`\}[\s\S]*\{preview\.franchise\.title\}/,
    )
    assert.doesNotMatch(sectionSource, /Смотреть всё/)
    assert.match(sectionSource, /overflow-x-auto pb-1 md:hidden/)
    assert.match(sectionSource, /hidden md:block/)
    assert.match(sectionSource, /variant="archive"/)
    assert.match(sectionSource, /ARCHIVE_LIST_TARGET_TILE_WIDTH/)
    assert.match(sectionSource, /Array\.from\(\{ length: 5 \}/)
    assert.match(sectionSource, /Серия появится, когда в архиве будет хотя бы пять связанных записей\./)
    assert.notEqual(pageSource.indexOf("<RandomFranchiseSection"), -1)
  })
})
