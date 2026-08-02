import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { describe, it } from "node:test";

const globalsSource = readFileSync("src/app/globals.css", "utf8");
const sharedHeaderSource = readFileSync(
  "src/components/archive/archive-site-header.tsx",
  "utf8",
);
const headerSource = readFileSync("src/app/catalog-sticky-header.tsx", "utf8");
const layoutSource = readFileSync(
  "src/components/archive/archive-catalog-layout.tsx",
  "utf8",
);
const catalogSource = readFileSync("src/app/media-items-catalog.tsx", "utf8");
const controlsSource = readFileSync("src/app/catalog-header-controls.tsx", "utf8");
const previewSource = readFileSync("src/app/media-catalog-preview.tsx", "utf8");
const tabsSource = readFileSync("src/app/media-type-tabs.tsx", "utf8");

describe("simple catalog layout", () => {
  it("uses the shared textured block without generated layers", () => {
    assert.match(globalsSource, /\.archive-textured-block\s*\{[\s\S]*border-radius: 8px;[\s\S]*box-shadow:/);
    assert.doesNotMatch(globalsSource, /\.archive-textured-block::(?:before|after)/);
    assert.match(sharedHeaderSource, /archive-textured-block items-center/);
    assert.match(sharedHeaderSource, /archive-sticky-header/);
    assert.doesNotMatch(headerSource, /archive-(?:paper|panel|stack)|-mt-2/);
    assert.doesNotMatch(sharedHeaderSource, /-mt-2/);
    assert.match(layoutSource, /archive-textured-block flex min-h-0/);
    assert.match(layoutSource, /archive-textured-block relative flex w-full/);
    assert.doesNotMatch(layoutSource, /archive-(?:paper|panel|stack)/);
    assert.match(catalogSource, /archive-textured-block p-6/);
  });

  it("keeps the distinctive paper folder tabs unchanged", () => {
    assert.match(tabsSource, /role="tablist"/);
    assert.match(tabsSource, /role="tab"/);
    assert.match(tabsSource, /aria-selected=\{isSelected\}/);
    assert.match(tabsSource, /onClick=\{onClick\}/);
    assert.match(tabsSource, /onClick=\{\(\) => onChange\(tab\.value\)\}/);
    assert.match(tabsSource, /\{count\}/);
    assert.match(tabsSource, /overflow-x-auto/);
    assert.match(tabsSource, /TAB_PAPER_CLASSES/);
    assert.match(tabsSource, /selectedIndex/);
    assert.match(tabsSource, /role="tooltip"/);
    assert.match(tabsSource, /archive-paper-surface/);
  });

  it("simplifies the preview shell without changing carrier content", () => {
    assert.doesNotMatch(
      previewSource,
      /clip-transparent-trimmed|archive-control-surface|-ml-2|rotate-\[0\.35deg\]/,
    );
    assert.match(previewSource, /getMediaCarrierFrame\(item\)/);
    assert.match(previewSource, /<ArchiveCover/);
    assert.match(previewSource, /<ArchiveRatingPanel/);
    assert.match(previewSource, /<MediaItemRatingDialog/);
    assert.match(previewSource, /<AuthorMediaStatusControls/);
    assert.match(previewSource, /<MediaItemFranchiseLinks/);
    assert.match(previewSource, /<MediaItemFranchiseSuggestionDialog/);
  });

  it("uses a plain local filter popup", () => {
    assert.match(controlsSource, /role="menu"[\s\S]*bg-stone-50/);
    assert.doesNotMatch(
      controlsSource.match(/id=\{filtersMenuId\}[\s\S]*?\n\s*>/)?.[0] ?? "",
      /archive-paper-surface/,
    );
  });
});
