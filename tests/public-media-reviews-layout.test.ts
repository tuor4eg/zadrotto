import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { describe, it } from "node:test";

const details = readFileSync("src/app/media-item-details.tsx", "utf8");
const reviews = readFileSync("src/app/media-item-reviews.tsx", "utf8");
const page = readFileSync("src/app/media/[code]/page.tsx", "utf8");

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

  it("renders the review shelf below the cover on desktop and after the archive note on mobile", () => {
    const archiveDetails = details.indexOf("function ArchiveMediaItemDetails");
    const coverAttribution = details.indexOf("<CoverSourceAttribution", archiveDetails);
    const desktopShelf = details.indexOf("{adjacentShelfSlot ?", coverAttribution);
    const detailsColumn = details.indexOf('className="flex min-h-[560px]', coverAttribution);
    const archiveNote = details.indexOf("<ArchiveNote", detailsColumn);
    const mobileShelf = details.indexOf("{adjacentShelfSlot ?", archiveNote);

    assert.ok(coverAttribution >= 0);
    assert.ok(desktopShelf > coverAttribution);
    assert.ok(detailsColumn > desktopShelf);
    assert.match(
      details.slice(desktopShelf, detailsColumn),
      /className="mt-6 hidden lg:block"/,
    );
    assert.match(
      details.slice(coverAttribution, desktopShelf + 30),
      /<\/div>\s*\{adjacentShelfSlot \?/,
    );
    assert.ok(archiveNote > detailsColumn);
    assert.ok(mobileShelf > archiveNote);
    assert.match(
      details.slice(mobileShelf),
      /className="mt-6 lg:hidden"/,
    );
  });

  it("keeps review modal actions above the paper without overlaying its heading", () => {
    assert.match(
      reviews,
      /role="dialog"[\s\S]*className="relative flex max-h-\[calc\(100vh-2\.5rem\)\] w-full max-w-5xl flex-col gap-2"/,
    );
    assert.match(reviews, /className="flex shrink-0 justify-end gap-2"/);
    assert.match(
      reviews,
      /grid h-\[calc\(100dvh-5\.75rem\)\][^\"]*grid-rows-\[auto_minmax\(0,1fr\)\][^\"]*rounded-md border border-stone-300\/80[^\"]*lg:h-\[min\(620px,calc\(100vh-5\.75rem\)\)\]/,
    );
    assert.doesNotMatch(reviews, /absolute right-(?:14|3) top-3/);
    assert.doesNotMatch(reviews, /<h2 id=\{titleId\} className="[^"]*pr-10/);
  });

  it("locks the background and contains mobile review scrolling", () => {
    assert.match(reviews, /document\.body\.style\.overflow = "hidden"/);
    assert.match(reviews, /document\.body\.style\.overflow = previousBodyOverflow/);
    assert.match(reviews, /archive-scrollbar min-h-0 touch-pan-y overflow-y-auto overscroll-contain/);
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
