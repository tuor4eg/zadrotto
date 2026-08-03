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
    assert.match(sharedHeaderSource, /archive-catalog-header archive-textured-block/);
    assert.match(sharedHeaderSource, /archive-sticky-header/);
    assert.doesNotMatch(headerSource, /archive-(?:paper|panel|stack)|-mt-2/);
    assert.doesNotMatch(sharedHeaderSource, /-mt-2/);
    assert.match(layoutSource, /archive-textured-block flex min-h-0/);
    assert.match(layoutSource, /archive-textured-block relative flex w-full/);
    assert.doesNotMatch(layoutSource, /archive-(?:paper|panel|stack)/);
    assert.match(catalogSource, /archive-textured-block p-6/);
  });

  it("splits the mobile catalog header and reunifies it on desktop", () => {
    assert.match(globalsSource, /\.archive-catalog-header\s*\{\s*display: contents;/);
    assert.match(
      globalsSource,
      /\.archive-catalog-controls-row\s*\{[\s\S]*position: sticky;[\s\S]*safe-area-inset-top/,
    );
    assert.match(
      globalsSource,
      /\.archive-catalog-brand-row\s*\{[\s\S]*padding-right: 0\.5rem;[\s\S]*border-bottom: 0;[\s\S]*box-shadow: none;/,
    );
    assert.match(
      globalsSource,
      /\.archive-catalog-controls-row\s*\{[\s\S]*margin-top: -0\.75rem;[\s\S]*border-top: 0;/,
    );
    assert.match(globalsSource, /@media \(min-width: 1024px\)[\s\S]*\.archive-catalog-header\s*\{[\s\S]*display: flex;/);
    assert.match(
      globalsSource,
      /\.archive-catalog-brand-row\s*\{\s*display: contents;/,
    );
    assert.match(
      globalsSource,
      /\.archive-catalog-controls-row\s*\{[\s\S]*display: flex;[\s\S]*flex: 0 1 auto;[\s\S]*order: 2;[\s\S]*gap: 0\.5rem;[\s\S]*position: static;[\s\S]*margin: 0 0 0 auto;/,
    );
    assert.match(
      globalsSource,
      /\.archive-catalog-header\s*\{[\s\S]*justify-content: flex-start;/,
    );
    assert.match(
      globalsSource,
      /@media \(min-width: 1024px\)[\s\S]*\.archive-catalog-header\s*\{[\s\S]*gap: 0\.5rem;/,
    );
    assert.match(sharedHeaderSource, /archive-catalog-brand-row/);
    assert.match(sharedHeaderSource, /archive-catalog-brand-landmark/);
    assert.match(sharedHeaderSource, /archive-catalog-header-actions/);
    assert.match(sharedHeaderSource, /hidden[\s\S]*lg:block/);
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

  it("continues the catalog paper through the active folder tab", () => {
    assert.match(
      globalsSource,
      /\.archive-media-type-tab-active\s*\{[\s\S]*background: transparent;/,
    );
    assert.match(globalsSource, /\.archive-media-type-tab-active\s*\{[\s\S]*box-shadow:/);
    assert.match(tabsSource, /isSelected[\s\S]*archive-media-type-tab-active/);
    assert.match(
      tabsSource,
      /const hasOverlap = index > 0 && !isSelected && index !== selectedIndex \+ 1/,
    );
    assert.match(
      tabsSource,
      /"--tab-mobile-overlap": hasOverlap[\s\S]*"--tab-overlap": hasOverlap/,
    );
    const activeTabBranch = tabsSource.match(
      /\? "archive-media-type-tab-active[^\n]+/,
    )?.[0] ?? "";

    assert.doesNotMatch(activeTabBranch, /after:|archive-paper-end/);
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
    assert.match(controlsSource, /className="archive-catalog-filter-menu/);
    assert.match(
      globalsSource,
      /\.archive-catalog-filter-menu\s*\{[\s\S]*position: fixed;[\s\S]*safe-area-inset-top/,
    );
    assert.match(
      globalsSource,
      /@media \(min-width: 1024px\)[\s\S]*\.archive-catalog-filter-menu\s*\{[\s\S]*position: absolute;/,
    );
  });
});
