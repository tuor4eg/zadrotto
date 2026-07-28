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
    const coverAttribution = details.indexOf("<CoverSourceAttribution");
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
    assert.ok(archiveNote > detailsColumn);
    assert.ok(mobileShelf > archiveNote);
    assert.match(
      details.slice(mobileShelf),
      /className="mt-6 lg:hidden"/,
    );
  });
});
