import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { describe, it } from "node:test";

const globalsSource = readFileSync("src/app/globals.css", "utf8");
const sharedHeaderSource = readFileSync(
  "src/components/archive/public-site-header.tsx",
  "utf8",
);
const archivePageSource = readFileSync("src/app/archive/page.tsx", "utf8");
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
    assert.match(sharedHeaderSource, /z-50 w-full text-stone-100/);
    assert.doesNotMatch(sharedHeaderSource, /z-50 w-full bg-stone-900/);
    assert.doesNotMatch(sharedHeaderSource, /sticky top-0/);
    assert.doesNotMatch(sharedHeaderSource, /-mt-2/);
    assert.match(layoutSource, /archive-textured-block flex min-h-0/)
    assert.match(layoutSource, /archive-textured-block flex h-full min-h-0 w-full/)
    assert.match(layoutSource, /xl:sticky xl:top-4/)
    assert.doesNotMatch(layoutSource, /archive-(?:paper|panel|stack)/);
    assert.match(catalogSource, /archive-textured-block p-6/);
    assert.match(layoutSource, /archive-catalog-list-panel archive-textured-block/);
    assert.match(
      globalsSource,
      /\.archive-catalog-list-panel\s*\{[\s\S]*linear-gradient\(180deg,[\s\S]*archive-paper-start[\s\S]*archive-paper-end/,
    );
  });

  it("keeps catalog controls in the single non-sticky header row", () => {
    assert.match(sharedHeaderSource, /controls \? \([\s\S]*\{controls\}[\s\S]*\) : \(/);
    assert.doesNotMatch(sharedHeaderSource, /secondaryControls|sticky top-0/);
    assert.match(archivePageSource, /<PublicSiteHeader[\s\S]*controls=[\s\S]*<CatalogHeaderControls/);
    assert.doesNotMatch(archivePageSource, /secondaryControls|showSearch|\bsticky\b/);
    assert.doesNotMatch(archivePageSource, /isCompact|setIsCompact|addEventListener\("scroll"/);
    assert.doesNotMatch(globalsSource, /archive-catalog-header-compact/);
  });

  it("keeps the distinctive paper folder tabs unchanged", () => {
    assert.match(tabsSource, /role="tablist"/);
    assert.match(tabsSource, /role="tab"/);
    assert.match(tabsSource, /aria-selected=\{isSelected\}/);
    assert.match(tabsSource, /onClick=\{onClick\}/);
    assert.match(tabsSource, /onClick=\{\(\) => onChange\(tab\.value\)\}/);
    assert.match(tabsSource, /\{count\}/);
    assert.match(tabsSource, /overflow-x-auto/);
    assert.doesNotMatch(tabsSource, /TAB_PAPER_CLASSES|bg-\[#/);
    assert.match(tabsSource, /archive-media-type-tab-inactive/);
    assert.match(tabsSource, /archive-media-type-tab group/);
    assert.match(tabsSource, /selectedIndex/);
    assert.match(tabsSource, /role="tooltip"/);
    assert.match(tabsSource, /archive-paper-surface/);
  });

  it("highlights the active tab by color without a raised top label", () => {
    assert.match(
      globalsSource,
      /\.archive-media-type-tab-active\s*\{[\s\S]*background: transparent;/,
    );
    assert.match(
      globalsSource,
      /\.archive-media-type-tab::before\s*\{[\s\S]*calc\(100% - var\(--archive-media-type-tab-shape-size\)\)[\s\S]*100% var\(--archive-media-type-tab-shape-size\)/,
    );
    assert.match(globalsSource, /\.archive-media-type-tab\s*\{[\s\S]*0\.833333rem/);
    assert.match(globalsSource, /@media \(min-width: 1024px\)[\s\S]*\.archive-media-type-tab\s*\{[\s\S]*1rem/);
    assert.match(
      globalsSource,
      /-webkit-clip-path: polygon\([\s\S]*clip-path: polygon\(/,
    );
    assert.doesNotMatch(globalsSource, /polygon\(\s*round/);
    assert.match(tabsSource, /inline-flex shrink-0 items-end justify-center/);
    assert.match(tabsSource, /archive-media-type-tab-active h-10[^"]*lg:h-12/);
    assert.match(tabsSource, /min-h-10[^"]*lg:min-h-12/);
    assert.match(
      globalsSource,
      /\.archive-media-type-tab-inactive::before\s*\{[\s\S]*background-color: color-mix[\s\S]*inset 0 -6px 10px -10px[^;]*\/ 34%/,
    );
    assert.doesNotMatch(
      globalsSource.match(/\.archive-media-type-tab-active::before\s*\{[\s\S]*?\n\}/)?.[0] ?? "",
      /linear-gradient/,
    );
    assert.match(
      globalsSource,
      /\.archive-media-type-tab-active::before\s*\{[\s\S]*background-color: color-mix\([\s\S]*archive-paper-start[\s\S]*88%[\s\S]*archive-bg-start/,
    );
    assert.doesNotMatch(
      globalsSource.match(/\.archive-media-type-tab-active::before\s*\{[\s\S]*?\n\}/)?.[0] ?? "",
      /inset 0 7px|drop-shadow/,
    );
    assert.match(globalsSource, /archive-media-type-tab-active-shadow[\s\S]*drop-shadow\(4px 2px 5px/);
    assert.match(globalsSource, /archive-media-type-tab-active-shadow > span[\s\S]*border-top-left-radius: 6px/);
    assert.match(tabsSource, /archive-media-type-tab-active-shadow/);
    assert.doesNotMatch(
      globalsSource.match(/\.archive-media-type-tab-active::before\s*\{[\s\S]*?\n\}/)?.[0] ?? "",
      /56%/,
    );
    assert.match(tabsSource, /isSelected[\s\S]*archive-media-type-tab-active/);
    assert.match(
      tabsSource,
      /const hasOverlap = index > 0 && !isSelected && index !== selectedIndex \+ 1/,
    );
    assert.match(
      globalsSource,
      /\.archive-media-type-tab-inactive::after\s*\{[\s\S]*right: -10px;[\s\S]*width: 22px;[\s\S]*filter: blur\(8px\)/,
    );
    assert.doesNotMatch(
      globalsSource.match(/\.archive-media-type-tab-inactive\s*\{[\s\S]*?\n\}/)?.[0] ?? "",
      /box-shadow/,
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
    assert.match(previewSource, /Открыть досье/);
    assert.match(previewSource, /h-14 min-w-0 flex-1 px-4 text-base[^"\n]*\[&_svg\]:size-6/);
    assert.match(previewSource, /variant="preview"/);
    assert.match(previewSource, /mt-auto flex justify-end pt-4/);
    assert.match(previewSource, /<MediaItemFranchiseLinks/);
    assert.match(previewSource, /<MediaItemFranchiseSuggestionDialog/);
    assert.match(previewSource, /<span className="break-words">\{metaItem\}<\/span>/);
    assert.doesNotMatch(previewSource, /min-w-0 truncate/);
  });

  it("uses a plain local filter popup", () => {
    assert.match(controlsSource, /relative min-w-0 w-full sm:w-56[^"\n]*lg:w-60 lg:flex-none/);
    assert.match(controlsSource, /lg:flex lg:flex-nowrap lg:justify-end/);
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
