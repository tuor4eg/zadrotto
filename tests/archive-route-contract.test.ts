import assert from "node:assert/strict";
import { existsSync, readFileSync } from "node:fs";
import path from "node:path";
import { describe, it } from "node:test";

const mainPage = readFileSync("src/app/page.tsx", "utf8");
const publicHeader = readFileSync("src/components/archive/public-site-header.tsx", "utf8");
const archivePage = readFileSync("src/app/archive/page.tsx", "utf8");
const catalogControls = readFileSync("src/app/catalog-header-controls.tsx", "utf8");
const catalogItems = readFileSync("src/app/media-items-catalog.tsx", "utf8");
const mediaPage = readFileSync("src/app/media/[code]/page.tsx", "utf8");
const mediaItemDetails = readFileSync("src/app/media-item-details.tsx", "utf8");
const seriesCatalogPage = readFileSync("src/app/series/page.tsx", "utf8");

const catalogRevalidationFiles = [
  "src/app/media/franchise-actions.ts",
  "src/app/ratings/actions.ts",
  "src/app/media-status/actions.ts",
  "src/app/archive/archive-series-actions.ts",
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
  it("serves the new journal at root, the catalog at /archive, and removes temporary routes", () => {
    assert.match(mainPage, /PublicSiteHeader/);
    assert.match(mainPage, /export const dynamic = "force-dynamic"/);
    assert.match(publicHeader, /<Link href="\/" aria-label="Главная"/);
    assert.equal(existsSync(path.join("src", "app", "test", "page.tsx")), false);
    assert.equal(existsSync(path.join("src", "app", "main", "page.tsx")), false);

    assert.match(archivePage, /from "@\/app\/media-items-catalog"/);
    assert.match(archivePage, /from "@\/components\/archive\/public-site-header"/);
    assert.match(archivePage, /<PublicSiteHeader[\s\S]*controls=[\s\S]*<CatalogHeaderControls/);
    assert.doesNotMatch(archivePage, /secondaryControls|showSearch|\bsticky\b/);
  });

  it("keeps the public series catalog as wide as the archive catalog", () => {
    assert.match(archivePage, /max-w-\[1480px\]/);
    assert.match(seriesCatalogPage, /max-w-\[1480px\]/);
  });

  it("stretches a short media dossier card to the footer", () => {
    assert.match(mediaPage, /archive-page flex min-h-0 flex-1 flex-col/);
    assert.match(mediaPage, /max-w-\[1480px\] flex-1 flex-col/);
    assert.match(mediaPage, /flex min-h-0 w-full flex-1 flex-col|flex-1 flex-col gap-3/);

    assert.match(
      mediaItemDetails,
      /archive-paper archive-panel archive-panel-overflow-visible[^"]*flex-1/,
    );
  });

  it("submits the main-page search to the archive only on form submission", () => {
    assert.match(
      publicHeader,
      /<form[\s\S]*action="\/archive"[\s\S]*method="get"[\s\S]*role="search"[\s\S]*aria-label="Поиск по архиву"/,
    );
    assert.match(publicHeader, /<input[\s\S]*name="q"[\s\S]*type="search"/);
    assert.match(publicHeader, /placeholder="Поиск по архиву"/);
    assert.match(catalogControls, /placeholder="Поиск по архиву"/);
    assert.match(publicHeader, /id="public-header-search"[\s\S]*archive-control-surface h-9/);
    assert.doesNotMatch(publicHeader, /onChange=|useDebouncedSearchDraft/);
  });

  it("opens guest authorization in a modal and keeps author actions compact", () => {
    assert.doesNotMatch(publicHeader, /NotificationBell/);
    assert.match(
      publicHeader,
      /currentAdminUser \? \([\s\S]*href="\/admin"[\s\S]*<NotificationBadge[\s\S]*count=\{adminNotificationCount\}[\s\S]*href="\/author\/profile"/,
    );
    assert.match(publicHeader, /<UserRound[^>]*aria-hidden="true"/);
    assert.match(publicHeader, /onClick=\{\(\) => setIsLoginOpen\(true\)\}/);
    assert.match(publicHeader, /createPortal\([\s\S]*<AuthorLoginModal/);
    assert.match(publicHeader, /onSuccess=\{\(\) => \{[\s\S]*router\.refresh\(\)/);
    assert.doesNotMatch(publicHeader, /href=\{author \? "\/author" : "\/author\/login"\}/);
  });

  it("links public breadcrumbs without duplicating the global archive navigation", () => {
    assert.doesNotMatch(mediaPage, /href="\/archive"/);
    assert.doesNotMatch(seriesCatalogPage, /href="\/archive"/);
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
