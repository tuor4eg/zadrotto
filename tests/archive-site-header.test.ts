import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { describe, it } from "node:test";

const sharedSource = readFileSync(
  "src/components/archive/archive-site-header.tsx",
  "utf8",
);
const catalogSource = readFileSync("src/app/catalog-sticky-header.tsx", "utf8");
const mainSource = readFileSync("src/app/main/page.tsx", "utf8");

describe("archive site header", () => {
  it("owns the shared brand, actions, and login modal", () => {
    assert.match(sharedSource, /src="\/site-logo\.png"/);
    assert.match(sharedSource, /Журнал, которого не было/);
    assert.match(sharedSource, /База хранит факты\. Журнал достает из них память\./);
    assert.match(sharedSource, /href="\/admin"/);
    assert.match(sharedSource, /href="\/author"/);
    assert.match(sharedSource, /<AuthorLoginModal/);
    assert.match(sharedSource, /router\.refresh\(\)/);
  });

  it("is used by both archive entry points with the correct brand links", () => {
    assert.match(
      catalogSource,
      /<ArchiveSiteHeader[\s\S]*brandHref="\/main"[\s\S]*variant="catalog"/,
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
    assert.match(catalogSource, /compact=\{isCompact\}/);
    assert.match(catalogSource, /\bsticky\b/);
    assert.match(sharedSource, /archive-sticky-header/);
    assert.match(sharedSource, /lg:max-w-\[320px\]/);
    assert.match(sharedSource, /archive-textured-block/);
  });

  it("does not duplicate navigation or modal ownership in the wrappers", () => {
    assert.doesNotMatch(
      catalogSource,
      /AuthorLoginModal|site-logo\.png|href="\/(?:admin|author)"|createPortal|useRouter/,
    );
    assert.doesNotMatch(mainSource, /AuthorLoginModal|href="\/(?:admin|author)"/);
  });
});
