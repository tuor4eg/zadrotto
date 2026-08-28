import assert from "node:assert/strict";
import { existsSync, readFileSync } from "node:fs";
import path from "node:path";
import { describe, it } from "node:test";

const mainPage = readFileSync("src/app/page.tsx", "utf8");
const archivePage = readFileSync("src/app/archive/page.tsx", "utf8");
const catalogHeader = readFileSync("src/app/catalog-sticky-header.tsx", "utf8");
const catalogControls = readFileSync("src/app/catalog-header-controls.tsx", "utf8");
const catalogItems = readFileSync("src/app/media-items-catalog.tsx", "utf8");
const mediaPage = readFileSync("src/app/media/[code]/page.tsx", "utf8");
const seriesCatalogPage = readFileSync("src/app/series/page.tsx", "utf8");
const seriesPage = readFileSync("src/app/series/[code]/page.tsx", "utf8");

const catalogRevalidationFiles = [
  "src/app/media/franchise-actions.ts",
  "src/app/ratings/actions.ts",
  "src/app/media-status/actions.ts",
  "src/app/series/[code]/actions.ts",
  "src/app/admin/(protected)/media-review/actions.ts",
  "src/app/admin/(protected)/franchise-review/actions.ts",
  "src/app/admin/(protected)/media/actions.ts",
  "src/app/author/(protected)/settings/media-types/actions.ts",
  "src/app/author/(protected)/media/actions.ts",
  "src/app/admin/(protected)/media-types/actions.ts",
];

const layoutRevalidationFiles = [
  "src/app/media/franchise-actions.ts",
  "src/app/author/(protected)/media/actions.ts",
  "src/app/admin/(protected)/series/actions.ts",
];

describe("archive route split", () => {
  it("serves the journal at root, the catalog at /archive, and no /main route", () => {
    assert.match(mainPage, /from "@\/components\/archive\/responsive-tile-grid"/);
    assert.match(mainPage, /from "\.\/main\/main-login-button"/);
    assert.match(mainPage, /href="\/archive\?sort=average_score"/);
    assert.match(mainPage, /href="\/archive"[\s\S]*title="Последние рецензии"/);
    assert.doesNotMatch(mainPage, /href="\/\?/);
    assert.equal(existsSync(path.join("src", "app", "main", "page.tsx")), false);

    assert.match(archivePage, /from "@\/app\/media-items-catalog"/);
    assert.match(archivePage, /from "@\/app\/catalog-sticky-header"/);
    assert.match(catalogHeader, /brandHref="\/"/);
    assert.doesNotMatch(catalogHeader, /\/main/);
  });

  it("submits the main-page search to the archive only on form submission", () => {
    assert.match(
      mainPage,
      /<form action="\/archive" method="get" role="search" aria-label="Поиск по архиву">/,
    );
    assert.match(mainPage, /<input[\s\S]*name="q"[\s\S]*type="search"/);
    assert.match(mainPage, /<ArchiveSiteHeader[\s\S]*controls=\{[\s\S]*<MainArchiveSearch \/>[\s\S]*<ArchiveExplorationLauncher/);
    assert.doesNotMatch(mainPage, /onChange=|useDebouncedSearchDraft/);
  });

  it("links public archive breadcrumbs and media types to the catalog", () => {
    assert.match(mediaPage, /href="\/archive"[\s\S]*Архив/);
    assert.match(seriesCatalogPage, /href="\/archive"[\s\S]*Архив/);
    assert.match(seriesPage, /href="\/archive"[\s\S]*Архив/);
    assert.match(
      mediaPage,
      /href=\{`\/archive\?type=\$\{encodeURIComponent\(item\.mediaType\)\}`\}/,
    );
  });

  it("keeps catalog filters and pagination on the active archive pathname", () => {
    for (const source of [catalogControls, catalogItems]) {
      assert.match(source, /const pathname = usePathname\(\)/);
      assert.match(
        source,
        /router\.replace\(queryString \? `\$\{pathname\}\?\$\{queryString\}` : pathname/,
      );
    }
    assert.match(catalogItems, /basePath=\{pathname\}/);
  });

  it("revalidates both journal and catalog after focused archive mutations", () => {
    for (const file of catalogRevalidationFiles) {
      const source = readFileSync(file, "utf8");

      assert.match(source, /revalidatePath\("\/"\)/, `${file} must revalidate the journal`);
      assert.match(
        source,
        /revalidatePath\("\/archive"\)/,
        `${file} must revalidate the catalog`,
      );
    }
  });

  it("preserves broad root layout revalidation where nested surfaces depend on it", () => {
    for (const file of layoutRevalidationFiles) {
      const source = readFileSync(file, "utf8");

      assert.match(
        source,
        /revalidatePath\("\/", "layout"\)/,
        `${file} must keep broad root layout revalidation`,
      );
    }
  });
});
