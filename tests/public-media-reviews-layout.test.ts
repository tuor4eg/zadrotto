import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { describe, it } from "node:test";

const details = readFileSync("src/app/media-item-details.tsx", "utf8");
const reviews = readFileSync("src/app/media-item-reviews.tsx", "utf8");
const page = readFileSync("src/app/media/[code]/page.tsx", "utf8");

describe("public media reviews layout", () => {
  it("hides an empty review shelf from guests", () => {
    assert.match(reviews, /if \(!currentAuthor && reviews\.length === 0\) \{\s*return null/);
    assert.match(page, /adjacentShelfSlot=\{\s*currentAuthor \|\| reviews\.length > 0 \?/);
  });

  it("renders the review shelf below the cover instead of across the full dossier", () => {
    const coverAttribution = details.indexOf("<CoverSourceAttribution");
    const shelf = details.indexOf("{adjacentShelfSlot ?", coverAttribution);
    const detailsColumn = details.indexOf('className="flex min-h-[560px]', coverAttribution);

    assert.ok(coverAttribution >= 0);
    assert.ok(shelf > coverAttribution);
    assert.ok(detailsColumn > shelf);
    assert.doesNotMatch(
      details.slice(detailsColumn),
      /<section>\s*\{adjacentShelfSlot/,
    );
  });
});
