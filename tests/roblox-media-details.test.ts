import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { describe, it } from "node:test";

const detailsSource = readFileSync("src/app/media-item-details.tsx", "utf8");
const previewSource = readFileSync("src/app/media-catalog-preview.tsx", "utf8");

describe("saved Roblox media details", () => {
  it("adds saved creation year, genre, category, and creator to the Roblox metadata line", () => {
    assert.match(detailsSource, /item\.mediaType !== "roblox"/);
    assert.match(detailsSource, /getDateFactYear\(item\.metadataFacts, "createdAt"\)/);
    assert.match(detailsSource, /getStringFact\(item\.metadataFacts, "genre"\)/);
    assert.match(detailsSource, /getStringFact\(item\.metadataFacts, "genreLevel1"\)/);
    assert.match(detailsSource, /getStringFact\(item\.metadataFacts, "creatorName"\)/);
    assert.match(detailsSource, /\.\.\.robloxDetailLabels/);
  });

  it("shows the Roblox creation year in the catalog preview without setting releaseYear", () => {
    assert.match(
      previewSource,
      /item\.mediaType === "roblox"[\s\S]*getDateFactYear\(item\.metadataFacts, "createdAt"\)/,
    );
    assert.match(previewSource, /const metaItems = \[[\s\S]*yearLabel/);
  });

  it("keeps the archive dossier values in the shared bullet-separated metadata line", () => {
    assert.match(detailsSource, /archiveInfoLabels\.map[\s\S]*<span className="mx-1\.5">•<\/span>/);
  });
});
