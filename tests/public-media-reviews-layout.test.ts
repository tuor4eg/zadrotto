import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { describe, it } from "node:test";

const details = readFileSync("src/app/media-item-details.tsx", "utf8");
const reviews = readFileSync("src/app/media-item-reviews.tsx", "utf8");
const mediaPage = readFileSync("src/app/media/[code]/page.tsx", "utf8");
const reviewArticle = readFileSync("src/app/review-article.tsx", "utf8");
const reviewPage = readFileSync("src/app/reviews/[id]/page.tsx", "utf8");
const globals = readFileSync("src/app/globals.css", "utf8");
const reviewQuery = readFileSync("src/db/queries/contribution-reviews.ts", "utf8");
const mainPage = readFileSync("src/app/page.tsx", "utf8");

describe("public media reviews layout", () => {
  it("hides an empty review shelf from guests and keeps it below the cover", () => {
    assert.match(reviews, /if \(!currentAuthor && reviews\.length === 0\) \{\s*return null/);
    assert.match(mediaPage, /adjacentShelfSlot=\{\s*currentAuthor \|\| reviews\.length > 0 \?/);
    const cover = details.indexOf("<ArchiveCover");
    const reviewShelf = details.indexOf("{adjacentShelfSlot ?", cover);
    const archiveNote = details.indexOf("<ArchiveNote", reviewShelf);
    assert.ok(reviewShelf > cover && archiveNote > reviewShelf);
  });

  it("renders three review previews and one action card", () => {
    assert.match(reviews, /reviews\.slice\(0, 3\)\.map/);
    assert.match(reviews, /<ReviewQuotePreview body=\{review\.body\} \/>/);
    assert.match(reviews, /<ReviewAuthorStars compact score=\{review\.authorScore\} \/>/);
    assert.match(reviews, /hiddenReviewsCount=\{Math\.max\(0, reviews\.length - 3\)\}/);
    assert.match(reviews, /Ещё \{hiddenReviewsCount\} мнений/);
  });

  it("opens reviews as normal links to a dedicated page", () => {
    assert.match(reviews, /<Link[\s\S]*href=\{`\/reviews\/\$\{review\.id\}`\}/);
    assert.doesNotMatch(reviews, /useRouter|useSearchParams|role="dialog"/);
    assert.doesNotMatch(mediaPage, /MediaItemReviewLayer/);
    assert.match(mediaPage, /legacyReviewId[\s\S]*redirect\(`\/reviews\/\$\{legacyReviewId\}`\)/);
    assert.match(reviewPage, /<ReviewArticle[\s\S]*mediaItemMeta=\{getMediaItemSummaryParts/);
  });

  it("keeps the latest review cover visible on the main page", () => {
    assert.match(mainPage, /const coverUrl = review\?\.coverThumbUrl \?\? review\?\.coverUrl/);
    assert.match(
      mainPage,
      /aria-labelledby="main-latest-review"[\s\S]*backgroundImage: `url\(\$\{JSON\.stringify\(coverUrl\)\}\)`[\s\S]*position: "absolute"/,
    );
  });

  it("keeps the main-page review card focused on the latest review", () => {
    assert.doesNotMatch(mainPage, /href="\/reviews"[\s\S]*Смотреть всё/);
    assert.match(mainPage, /href=\{`\/reviews\/\$\{review\.id\}`\}/);
  });

  it("renders full document-sized review content and actions", () => {
    assert.match(reviewArticle, /archive-paper archive-panel archive-stack archive-stack-left[^"]*min-h-\[calc\(100dvh-2rem\)\]/);
    assert.match(reviewArticle, />Досье<[\s\S]*aria-label="Хлебные крошки"/);
    assert.match(reviewArticle, /<MediaCarrierDisplayTitle title=\{review\.mediaItemTitle\}/);
    assert.match(reviewArticle, /mediaItemMeta\.map/);
    assert.match(reviewArticle, /<h1[\s\S]*\{review\.title\}/);
    assert.match(reviewArticle, /archive-review-paper relative flex flex-1[\s\S]*whitespace-pre-wrap/);
    assert.doesNotMatch(reviewArticle, /border-t border-stone-400\/30/);
    assert.match(reviewArticle, /href=\{`\/users\/\$\{review\.authorId\}`\}[\s\S]*<Avatar/);
    assert.match(reviewArticle, /review\.authorScore !== null[\s\S]*Оценка автора[\s\S]*formatScore\(review\.authorScore\)/);
    assert.match(globals, /\.archive-review-paper \{[\s\S]*background-color: #f7efdc;/);
    assert.match(reviewArticle, /navigator\.share\(shareData\)/);
    assert.match(reviewArticle, /navigator\.clipboard\?\.writeText/);
  });

  it("loads only published reviews attached to visible records", () => {
    assert.match(reviewQuery, /getPublishedReviewById[\s\S]*contributions\.status, PUBLISHED_CONTRIBUTION_STATUS[\s\S]*mediaItems\.publicationStatus, PUBLISHED_PUBLICATION_STATUS[\s\S]*inArray\(mediaItems\.mediaType/);
    assert.match(reviewQuery, /authorScore: ratings\.score[\s\S]*\.leftJoin\([\s\S]*ratings\.authorId/);
    assert.match(reviewPage, /if \(!review\) notFound\(\)/);
    assert.match(reviewArticle, /href=\{`\/media\/\$\{review\.mediaItemCode\}`\}/);
  });

  it("links adjacent reviews without controls beyond the first and last review", () => {
    assert.match(reviewQuery, /getPublishedReviewNavigation[\s\S]*findIndex[\s\S]*previousReviewId: currentIndex > 0[\s\S]*nextReviewId:/);
    assert.match(reviewArticle, /previousReviewId \?[\s\S]*Предыдущая рецензия/);
    assert.match(reviewArticle, /nextReviewId \?[\s\S]*Следующая рецензия/);
    assert.match(reviewPage, /nextReviewId=\{reviewNavigation\.nextReviewId\}[\s\S]*previousReviewId=\{reviewNavigation\.previousReviewId\}/);
  });
});
