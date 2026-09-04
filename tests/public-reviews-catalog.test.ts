import assert from "node:assert/strict"
import { readFileSync } from "node:fs"
import { describe, it } from "node:test"

const read = (file: string) => readFileSync(file, "utf8")
const page = read("src/app/reviews/page.tsx")
const controls = read("src/app/reviews/reviews-catalog-controls.tsx")
const logic = read("src/app/reviews/reviews-catalog-logic.ts")
const row = read("src/app/reviews/review-catalog-row.tsx")
const queries = read("src/db/queries/contribution-reviews.ts")
const mediaReviews = read("src/app/media-item-reviews.tsx")
const authorActions = read("src/app/author/(protected)/reviews/actions.ts")
const adminActions = read("src/app/admin/(protected)/reviews/actions.ts")
const mainPage = read("src/app/page.tsx")

describe("public reviews catalog page", () => {
  it("renders the public catalog shell with search and presets", () => {
    assert.match(page, /export const metadata: Metadata = \{\s*title: "Рецензии"/)
    assert.match(page, /<PublicSiteHeader \{\.\.\.headerState\.headerProps\} \/>/)
    assert.match(page, /<h1[\s\S]*Рецензии/)
    assert.match(page, /Мнения авторов о фильмах, играх, книгах и прочем/)
    assert.match(page, /<ReviewsCatalogControls/)
    assert.match(page, /<FeaturedReviews reviews=\{featuredReviews\} \/>/)
    assert.match(page, /<PaginationNav[\s\S]*basePath="\/reviews"[\s\S]*variant="archive"/)
    assert.match(controls, /Поиск по названию записи/)
    assert.match(page, /currentAuthorId=\{headerState\.author\?\.id \?\? null\}/)
    assert.match(
      controls,
      /currentAuthorId === null[\s\S]*label: "Я", value: String\(currentAuthorId\)[\s\S]*filter\(\(author\) => author\.id !== currentAuthorId\)/,
    )
    assert.match(controls, /REVIEW_CATALOG_PRESETS\.map/)
    assert.doesNotMatch(controls, /Популярн|С комментари|Лента|Компактно/)
    assert.doesNotMatch(page, /Популярн|С комментари|Лента|Компактно/)
  })

  it("reuses the media-item review card for featured reviews", () => {
    assert.match(page, /FeaturedReviews/)
    assert.match(page, /FEATURED_REVIEWS_FETCH_LIMIT/)
    const featured = read("src/app/reviews/featured-reviews.tsx")
    assert.match(featured, /MediaItemReviewCard key=\{review\.id\}[\s\S]*variant="cover"/)
    assert.doesNotMatch(featured, /compact/)
    assert.match(featured, /FEATURED_CARD_WIDTH = 240/)
    assert.match(featured, /reviews\.slice\(0, columnCount\)/)
    assert.match(mediaReviews, /export function MediaItemReviewCard/)
    assert.match(mediaReviews, /variant === "cover"/)
    assert.match(mediaReviews, /ArchiveCover[\s\S]*carrierFrame=\{false\}/)
    assert.match(mediaReviews, /h-4\/5 bg-gradient-to-t from-black\/95 via-black\/70 to-transparent/)
    assert.match(mediaReviews, /justify-end px-2\.5 pb-1\.5 pt-2\.5[\s\S]*sm:pb-2/)
    assert.match(mediaReviews, /mediaItemTitle/)
    assert.match(mediaReviews, /reviews\.slice\(0, 3\)\.map\(\(review, index\) => \(\s*<MediaItemReviewCard/)
  })

  it("lists reviews as flat rows with cover, titles, author, and author score", () => {
    assert.match(row, /<ArchiveCover[\s\S]*carrierFrame=\{false\}/)
    assert.match(row, /item\.mediaItemTitle/)
    assert.match(row, /\{item\.title\}/)
    assert.doesNotMatch(row, /excerpt|line-clamp-2/)
    assert.match(row, /grid-cols-\[2\.75rem_minmax/)
    assert.match(row, /<Avatar[\s\S]*objectKey=\{item\.authorAvatarObjectKey\}/)
    assert.match(row, /AUTHOR_RATING_TONE_CLASS_NAMES/)
    assert.match(row, /size-9[\s\S]*formatScore\(item\.authorScore\)/)
    assert.doesNotMatch(row, /comment|комментар/i)
  })

  it("parses catalog filters without popular or comments presets", () => {
    assert.match(logic, /REVIEW_CATALOG_PRESETS = \["all", "fresh", "high", "long", "short"\]/)
    assert.match(logic, /"low",\s*"none"/)
    assert.doesNotMatch(logic, /popular|comments/)
  })

  it("queries only published reviews with search, presets, and author score join", () => {
    assert.match(
      queries,
      /getPublishedReviewsCatalog[\s\S]*PUBLISHED_CONTRIBUTION_STATUS[\s\S]*PUBLISHED_PUBLICATION_STATUS/,
    )
    assert.match(queries, /containsNormalizedSearchSql\(mediaItems\.title/)
    assert.doesNotMatch(queries, /containsNormalizedSearchSql\(contributionReviews\.title/)
    assert.doesNotMatch(queries, /containsNormalizedSearchSql\(contributionReviews\.body/)
    assert.match(
      queries,
      /getPublishedReviewsCatalog[\s\S]*title: contributionReviews\.title,[\s\S]*publishedAt: contributions\.reviewedAt/,
    )
    assert.doesNotMatch(
      queries,
      /getPublishedReviewsCatalog[\s\S]*body: contributionReviews\.body[\s\S]*getPublishedReviewCatalogAuthors/,
    )
    assert.match(queries, /interval '30 days'/)
    assert.match(queries, /char_length\(\$\{contributionReviews\.body\}\) >= 2000/)
    assert.match(queries, /char_length\(\$\{contributionReviews\.body\}\) <= 500/)
    assert.match(queries, /gte\(ratings\.score, 80\)/)
    assert.match(queries, /getLatestPublishedReviewCards[\s\S]*mediaItemTitle: mediaItems\.title[\s\S]*\.limit\(limit\)/)
    assert.match(
      queries,
      /getLatestPublishedReviewCards[\s\S]*return rows\.map[\s\S]*coverThumbUrl: resolveCoverUrl\(review\.coverThumbUrl\)[\s\S]*coverUrl: resolveCoverUrl\(review\.coverUrl\)/,
    )
    assert.match(queries, /getPublishedReviewCatalogAuthors/)
  })

  it("links from the main page and revalidates the catalog after publish changes", () => {
    assert.doesNotMatch(mainPage, /href="\/reviews"[\s\S]*Смотреть всё/)
    assert.match(authorActions, /revalidatePath\("\/reviews"\)/)
    assert.match(adminActions, /revalidatePath\("\/reviews"\)/)
  })
})
