import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { describe, it } from "node:test";

const details = readFileSync("src/app/media-item-details.tsx", "utf8");
const reviews = readFileSync("src/app/media-item-reviews.tsx", "utf8");
const page = readFileSync("src/app/media/[code]/page.tsx", "utf8");
const globals = readFileSync("src/app/globals.css", "utf8");
const reviewQuery = readFileSync("src/db/queries/contribution-reviews.ts", "utf8");

describe("public media reviews layout", () => {
  it("hides related-series sections without other records", () => {
    assert.match(
      details,
      /resolvedRelatedFranchiseSections[\s\S]*\.filter\(\(section\) => section\.items\.length > 0\)/,
    );
  });

  it("hides an empty review shelf from guests", () => {
    assert.match(reviews, /if \(!currentAuthor && reviews\.length === 0\) \{\s*return null/);
    assert.match(page, /adjacentShelfSlot=\{\s*currentAuthor \|\| reviews\.length > 0 \?/);
  });

  it("renders the review shelf as a full-width row below the main record details", () => {
    const archiveDetails = details.indexOf("function ArchiveMediaItemDetails");
    const archiveNote = details.indexOf("<ArchiveNote", archiveDetails);
    const reviewShelf = details.indexOf("{adjacentShelfSlot ?", archiveNote);
    const relatedSections = details.indexOf("{relatedFranchiseSections.length > 0 ?", reviewShelf);

    assert.ok(archiveNote >= 0);
    assert.ok(reviewShelf > archiveNote);
    assert.ok(relatedSections > reviewShelf);
    assert.match(details.slice(reviewShelf, relatedSections), /lg:col-span-2/);
    assert.equal(details.indexOf("{adjacentShelfSlot ?", reviewShelf + 1), -1);
  });

  it("fits polaroid review cards to the shelf and reserves an inert action stack", () => {
    assert.match(reviews, /new ResizeObserver\(updateVisibleReviewCount\)/);
    assert.match(reviews, /useState<\{[\s\S]*showActionStack: boolean;[\s\S]*visibleReviewCount: number;[\s\S]*\} \| null>\(null\)/);
    assert.match(reviews, /className="mt-4 flex min-h-\[172px\][^\"]*sm:min-h-\[188px\]"/);
    assert.match(reviews, /\{shelfLayout \? \([\s\S]*reviews\.slice\(0, shelfLayout\.visibleReviewCount\)[\s\S]*<ReviewActionStack/);
    assert.doesNotMatch(reviews, /rgba\(214,199,165,0\.32\)/);
    assert.match(reviews, /reviews\.slice\(0, shelfLayout\.visibleReviewCount\)\.map/);
    assert.match(reviews, /aspect-square[^\"]*bg-white[\s\S]*<ReviewQuotePreview body=\{review\.body\}/);
    assert.match(reviews, /absolute inset-\[7px\][^\"]*bg-\[#eee6d7\]/);
    assert.match(reviews, /archive-typewriter-text relative flex aspect-square/);
    assert.match(reviews, /function ReviewQuotePreview[\s\S]*content\.scrollHeight <= container\.clientHeight \+ 1/);
    assert.match(reviews, /min-h-0 flex-1 overflow-hidden text-\[10px\][^\"]*sm:text-\[11px\]/);
    assert.match(reviews, /normalizedBody\.slice\(0, middle\)\.trimEnd\(\)[\s\S]*…»`/);
    assert.doesNotMatch(reviews, /absolute bottom-0 right-0[^\"]*…»/);
    assert.doesNotMatch(reviews, /line-clamp-3/);
    assert.match(reviews, /pb-2\.5 pt-4[\s\S]*sm:pb-2\.5 sm:pt-4[\s\S]*mb-1 line-clamp-2[\s\S]*mt-0 flex items-center justify-center/);
    assert.match(reviews, /<ReviewQuotePreview body=\{review\.body\} \/>[\s\S]*relative z-10 mt-1 shrink-0[\s\S]*\{review\.title\}/);
    assert.match(reviews, /aria-hidden="true"[\s\S]*★★★★★/);
    assert.match(reviews, /Создать новую/);
    assert.match(reviews, /left-1\/2 top-1\/2[^\"]*-translate-x-1\/2[^\"]*-translate-y-1\/2[^\"]*sm:size-16/);
    assert.match(reviews, /Plus className="size-10[^\"]*sm:size-12"/);
    assert.match(reviews, /showActionStack = canShowReviewAction \|\| reviews\.length > fullWidthCapacity/);
    assert.match(reviews, /shelfLayout\.showActionStack \? \([\s\S]*showCreateAction=\{canShowReviewAction\}/);
    assert.match(reviews, /Ещё \{hiddenReviewsCount\} мнений/);
    assert.match(reviews, /<button[\s\S]*type="button"[\s\S]*disabled[\s\S]*переход пока недоступен/);
    assert.match(reviews, /absolute inset-0[^\"]*bg-white[\s\S]*absolute inset-\[7px\][^\"]*bg-\[#eee6d7\]/);
  });

  it("keeps review modal actions above the paper without overlaying its heading", () => {
    assert.match(
      reviews,
      /role="dialog"[\s\S]*className="relative flex max-h-\[calc\(100vh-2\.5rem\)\] w-full max-w-3xl flex-col"/,
    );
    assert.match(reviews, /className="absolute right-4 top-4 flex shrink-0 justify-end gap-2/);
    assert.match(
      reviews,
      /archive-review-sheet grid h-\[calc\(100dvh-2\.5rem\)\][^\"]*grid-rows-\[auto_minmax\(0,1fr\)\][^\"]*rounded-lg[^\"]*sm:h-\[min\(760px,calc\(100vh-2\.5rem\)\)\]/,
    );
    assert.match(reviews, /absolute right-4 top-4 flex shrink-0 justify-end gap-2[\s\S]*archive-typewriter-text min-h-9/);
    assert.match(reviews, /\{review\.authorName\}[\s\S]*mt-3 font-serif text-2xl[^\"]*sm:text-3xl[^>]*>★★★★★/);
    assert.match(reviews, /href=\{`\/users\/\$\{review\.authorId\}`\}[\s\S]*<Avatar[\s\S]*objectKey=\{review\.authorAvatarObjectKey\}[\s\S]*\{review\.authorName\}/);
    assert.match(reviewQuery, /authorId: authors\.id/);
    assert.match(reviewQuery, /authorScore: ratings\.score[\s\S]*\.leftJoin\([\s\S]*ratings\.authorId[\s\S]*ratings\.mediaItemId/);
    assert.match(reviews, /review\.authorScore !== null[\s\S]*Оценка автора[\s\S]*formatScore\(review\.authorScore\)[\s\S]*\/ 10/);
    assert.doesNotMatch(reviews, />\s*Рецензия\s*</);
    assert.doesNotMatch(reviews, /<header className="[^"]*border-b/);
    assert.doesNotMatch(reviews, /underline[^\"]*">\{publishedAt/);
    assert.match(globals, /\.archive-review-paper \{[\s\S]*background-color: #f7efdc;[\s\S]*background-repeat: repeat-y, repeat, no-repeat;/);
    assert.match(reviews, /flex min-h-0 flex-col gap-3 p-3[\s\S]*archive-review-paper[^\"]*flex-1/);
    assert.match(reviews, /<\/section>\s*\{review\.authorScore !== null[\s\S]*text-sm font-semibold">Оценка автора[\s\S]*text-right text-xl/);
    assert.doesNotMatch(reviews, /absolute right-(?:14|3) top-3/);
    assert.doesNotMatch(reviews, /<h2 id=\{titleId\} className="[^"]*pr-10/);
  });

  it("locks the background and contains mobile review scrolling", () => {
    assert.match(reviews, /document\.body\.style\.overflow = "hidden"/);
    assert.match(reviews, /document\.body\.style\.overflow = previousBodyOverflow/);
    assert.match(reviews, /archive-scrollbar min-h-0 flex-1 touch-pan-y overflow-y-auto overscroll-contain/);
  });

  it("deep-links published reviews and keeps one shared modal layer", () => {
    assert.match(page, /<MediaItemReviewLayer[\s\S]*mediaItemTitle=\{item\.title\}/);
    assert.match(reviews, /const reviewParam = searchParams\.get\("review"\)/);
    assert.match(reviews, /nextSearchParams\.set\("review", String\(review\.id\)\)/);
    assert.match(reviews, /router\.push\(`\$\{pathname\}\?\$\{nextSearchParams\.toString\(\)\}`/);
    assert.match(reviews, /reviews\.find\(\(review\) => review\.id === reviewId\)/);
    assert.match(reviews, /nextSearchParams\.delete\("review"\)/);
    assert.match(reviews, /router\.replace\(queryString \? `\$\{pathname\}\?\$\{queryString\}` : pathname/);
  });

  it("handles missing reviews with one toast and supports native sharing with clipboard fallback", () => {
    assert.match(reviews, /handledInvalidReviewParams/);
    assert.match(reviews, /text: "Рецензия не найдена"/);
    assert.match(reviews, /<ArchiveToasts messages=\{toastMessages\}/);
    assert.match(reviews, /navigator\.share\(shareData\)/);
    assert.match(reviews, /error\.name === "AbortError"/);
    assert.match(reviews, /navigator\.clipboard\?\.writeText[\s\S]*navigator\.clipboard\.writeText\(url\)/);
    assert.match(reviews, /onLinkCopied\(\)/);
    assert.match(reviews, /text: "Ссылка на рецензию скопирована"[\s\S]*tone: "success"/);
    assert.match(reviews, /aria-live="polite"/);
  });
});
