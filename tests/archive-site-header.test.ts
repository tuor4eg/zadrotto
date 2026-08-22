import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { describe, it } from "node:test";

const sharedSource = readFileSync(
  "src/components/archive/archive-site-header.tsx",
  "utf8",
);
const catalogSource = readFileSync("src/app/catalog-sticky-header.tsx", "utf8");
const mainSource = readFileSync("src/app/page.tsx", "utf8");
const archiveSource = readFileSync("src/app/archive/page.tsx", "utf8");
const queueSource = readFileSync("src/db/queries/admin-moderation-queue.ts", "utf8");
const globalsSource = readFileSync("src/app/globals.css", "utf8");

describe("archive site header", () => {
  it("owns the shared brand, actions, and login modal", () => {
    assert.match(sharedSource, /src="\/site-logo\.png"/);
    assert.match(sharedSource, /Журнал, которого не было/);
    assert.match(sharedSource, /База хранит факты, журнал достает из них память/);
    assert.match(sharedSource, /href="\/admin"/);
    assert.match(sharedSource, /href="\/author"/);
    assert.match(sharedSource, /<AuthorLoginModal/);
    assert.match(sharedSource, /router\.refresh\(\)/);
    assert.equal((sharedSource.match(/<AuthorLoginModal/g) ?? []).length, 1);
  });

  it("presents the quiz action as a high-rating call to play", () => {
    assert.match(sharedSource, /AUTHOR_RATING_TONE_CLASS_NAMES\.good/);
    assert.match(sharedSource, /const actionClassName = `archive-control-surface \$\{actionLayoutClassName\}/);
    assert.match(sharedSource, /const quizActionClassName = `\$\{actionLayoutClassName\} \$\{AUTHOR_RATING_TONE_CLASS_NAMES\.good\}/);
    assert.match(
      sharedSource,
      /aria-label="Сыграем"[\s\S]*<span[^>]*>Сыграем<\/span>[\s\S]*<CircleHelp/,
    );
    assert.equal((sharedSource.match(/hidden lg:mr-2 lg:block/g) ?? []).length, 2);
  });

  it("is used by both archive entry points with the correct brand links", () => {
    assert.match(
      catalogSource,
      /<ArchiveSiteHeader[\s\S]*brandHref="\/"[\s\S]*variant="catalog"/,
    );
    assert.match(
      mainSource,
      /<ArchiveSiteHeader[\s\S]*brandHref="\/"[\s\S]*variant="main"/,
    );
    assert.doesNotMatch(mainSource, /site-logo\.png|<header/);
  });

  it("keeps catalog scrolling, controls, sticky, and compact behavior in its wrapper", () => {
    assert.match(catalogSource, /window\.addEventListener\("scroll"/);
    assert.match(catalogSource, /setIsCompact/);
    assert.match(catalogSource, /<CatalogHeaderControls/);
    assert.equal((catalogSource.match(/<CatalogHeaderControls/g) ?? []).length, 1);
    assert.match(catalogSource, /compact=\{isCompact\}/);
    assert.match(catalogSource, /\bsticky\b/);
    assert.match(sharedSource, /archive-sticky-header/);
    assert.match(globalsSource, /\.archive-catalog-header-compact\s*\{[\s\S]*max-width: 320px/);
    assert.match(sharedSource, /archive-catalog-header archive-textured-block/);
    assert.match(sharedSource, /archive-catalog-brand-row/);
    assert.match(sharedSource, /archive-catalog-controls-row/);
    assert.match(sharedSource, /quizAction && !compact/);
  });

  it("keeps one action set in the non-sticky mobile brand row", () => {
    assert.equal((sharedSource.match(/const catalogActions =/g) ?? []).length, 1);
    assert.match(
      sharedSource,
      /const adminLink = currentAdminUser \? \([\s\S]*href="\/admin"[\s\S]*\) : null/,
    );
    assert.match(
      sharedSource,
      /const authorAction = currentAuthor \? \([\s\S]*href="\/author"[\s\S]*\) : \([\s\S]*<button[\s\S]*setIsLoginOpen\(true\)/,
    );
    assert.match(
      sharedSource,
      /archive-catalog-brand-row[\s\S]*\{catalogActions\}[\s\S]*archive-catalog-controls-row[^>]*>[\s\S]*\{controls\}/,
    );
    assert.match(
      globalsSource,
      /\.archive-catalog-header\s*\{\s*display: contents;[\s\S]*\.archive-catalog-controls-row\s*\{[\s\S]*position: sticky/,
    );
  });

  it("uses a neutral catalog wrapper and a dedicated brand landmark", () => {
    assert.match(sharedSource, /const SiteHeaderContainer = isCatalog \? "div" : "header"/);
    assert.match(
      sharedSource,
      /<SiteHeaderContainer[\s\S]*archive-catalog-brand-row[\s\S]*<header className="archive-catalog-brand-landmark min-w-0">[\s\S]*archive-catalog-brand-link[\s\S]*<\/header>[\s\S]*\{catalogActions\}/,
    );
    assert.match(
      globalsSource,
      /\.archive-catalog-brand-landmark\s*\{[\s\S]*max-width: 720px;[\s\S]*order: 1;/,
    );
    assert.match(
      globalsSource,
      /\.archive-catalog-header-compact \.archive-catalog-brand-landmark\s*\{[\s\S]*display: none;/,
    );
  });

  it("keeps the main header on its independent non-catalog layout", () => {
    assert.match(
      sharedSource,
      /: "archive-main-brand-header archive-paper archive-panel grid grid-cols-\[minmax\(0,1fr\)_auto\][^"]*lg:flex lg:justify-between[^"]*lg:px-7 lg:py-5"/,
    );
    assert.match(
      sharedSource,
      /<ActionsContainer aria-label="Основная навигация" className="contents lg:flex[^\"]*">[\s\S]*col-span-2 row-start-2[\s\S]*\{adminLink\}[\s\S]*\{authorAction\}/,
    );
    assert.match(mainSource, /className="relative w-full lg:w-\[298px\]"/);
    assert.match(sharedSource, /col-span-2 row-start-2 min-w-0[^"]*lg:flex[^"]*lg:gap-2[\s\S]*min-w-0 w-full lg:flex-1/);
    assert.match(sharedSource, /: "w-9 px-0 lg:w-auto lg:gap-2 lg:px-3"/);
    assert.match(sharedSource, /: "sr-only lg:not-sr-only"/);
    assert.match(
      sharedSource,
      /className="size-11 shrink-0 object-contain lg:size-14"[\s\S]*text-\[clamp\(0\.6875rem,3\.75vw,1\.25rem\)\][^"]*lg:text-4xl[\s\S]*hidden[^"]*lg:block/,
    );
  });

  it("badges the admin entry when there are submitted moderation requests", () => {
    assert.match(
      sharedSource,
      /href="\/admin"[\s\S]*NotificationBadge count=\{submittedRequestCount\}/,
    );
    assert.match(
      catalogSource,
      /submittedRequestCount=\{submittedRequestCount\}/,
    );
    assert.match(mainSource, /getSubmittedModerationRequestCountForAdmin/);
    assert.match(queueSource, /getOpenBugReportCount/);
    assert.match(
      mainSource,
      /currentAdmin \? getSubmittedModerationRequestCountForAdmin\(\) : 0/,
    );
    assert.match(archiveSource, /getSubmittedModerationRequestCountForAdmin/);
    assert.match(
      archiveSource,
      /currentAdminUser \? getSubmittedModerationRequestCountForAdmin\(\) : 0/,
    );
    assert.match(queueSource, /getSubmittedAuthorMediaItemsCountForAdmin\(\)/);
    assert.match(queueSource, /getSubmittedFranchisesCountForAdmin\(\)/);
    assert.match(queueSource, /getSubmittedContributionReviewCountForAdmin\(\)/);
    assert.match(
      queueSource,
      /mediaItemsCount \+ franchisesCount \+ reviewsCount/,
    );
  });

  it("does not duplicate navigation or modal ownership in the wrappers", () => {
    assert.doesNotMatch(
      catalogSource,
      /AuthorLoginModal|site-logo\.png|href="\/(?:admin|author)"|createPortal|useRouter/,
    );
    assert.doesNotMatch(mainSource, /AuthorLoginModal|href="\/(?:admin|author)"/);
  });
});
