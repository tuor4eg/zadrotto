import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { describe, it } from "node:test";

const editLinkSource = readFileSync(
  "src/components/archive/admin-entity-edit-link.tsx",
  "utf8",
);
const homeSource = readFileSync("src/app/page.tsx", "utf8");
const catalogSource = readFileSync("src/app/media-items-catalog.tsx", "utf8");
const previewSource = readFileSync("src/app/media-catalog-preview.tsx", "utf8");
const mediaPageSource = readFileSync("src/app/media/[code]/page.tsx", "utf8");
const franchisePageSource = readFileSync("src/app/franchises/[code]/page.tsx", "utf8");
const detailsSource = readFileSync("src/app/media-item-details.tsx", "utf8");

describe("admin entity edit action", () => {
  it("provides a shared accessible edit link", () => {
    assert.match(editLinkSource, /<ArchiveTooltip label=\{tooltipLabel\} side=\{tooltipSide\}>/);
    assert.match(editLinkSource, /href=\{href\}/);
    assert.match(editLinkSource, /aria-label=\{ariaLabel\}/);
    assert.match(editLinkSource, /<Pencil \/>/);
  });

  it("shows the edit action in the catalog preview only to an admin", () => {
    assert.match(homeSource, /currentAdmin=\{Boolean\(currentAdminUser\)\}/);
    assert.match(
      catalogSource,
      /<MediaCatalogPreview[\s\S]*currentAdmin=\{currentAdmin\}/,
    );
    assert.match(
      previewSource,
      /currentAdmin \? \([\s\S]*<AdminEntityEditLink[\s\S]*ariaLabel=\{`Редактировать запись \$\{item\.title\}`\}[\s\S]*href=\{`\/admin\/media\/\$\{item\.id\}\/edit`\}[\s\S]*tooltipLabel="Редактировать запись"[\s\S]*\) : null/,
    );
  });

  it("shows the edit action in the archive dossier header only to an admin", () => {
    assert.match(
      mediaPageSource,
      /Promise\.all\(\[[\s\S]*getCurrentAuthor\(\),[\s\S]*getCurrentAdminUser\(\),[\s\S]*\]\)/,
    );
    assert.match(
      mediaPageSource,
      /headerActions=\{[\s\S]*currentAdminUser \? \([\s\S]*<AdminEntityEditLink[\s\S]*ariaLabel=\{`Редактировать запись \$\{item\.title\}`\}[\s\S]*href=\{`\/admin\/media\/\$\{item\.id\}\/edit`\}[\s\S]*tooltipLabel="Редактировать запись"[\s\S]*\) : null[\s\S]*\}/,
    );
    assert.match(detailsSource, /headerActions=\{headerActions\}/);
    assert.match(
      detailsSource,
      /Досье<\/div>[\s\S]*\{breadcrumbSlot\}[\s\S]*headerActions \? <div className="shrink-0">\{headerActions\}<\/div> : null/,
    );
  });

  it("shows the series edit action only to an admin", () => {
    assert.match(
      franchisePageSource,
      /Promise\.all\(\[[\s\S]*getCurrentAuthor\(\),[\s\S]*getCurrentAdminUser\(\),[\s\S]*getMediaTypeOptions\(\),[\s\S]*\]\)/,
    );
    assert.match(
      franchisePageSource,
      /currentAdminUser \? \([\s\S]*<AdminEntityEditLink[\s\S]*ariaLabel=\{`Редактировать серию \$\{franchise\.title\}`\}[\s\S]*href=\{`\/admin\/franchises\/\$\{franchise\.id\}\/edit`\}[\s\S]*tooltipLabel="Редактировать серию"[\s\S]*tooltipSide="bottom"[\s\S]*\) : null/,
    );
  });
});
