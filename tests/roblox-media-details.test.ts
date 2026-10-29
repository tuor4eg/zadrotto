import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { describe, it } from "node:test";
import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { RobloxCreatorDetails } from "@/components/archive/roblox-creator-details";

const detailsSource = readFileSync("src/app/media-item-details.tsx", "utf8");
const previewSource = readFileSync("src/app/media-catalog-preview.tsx", "utf8");
const summarySource = readFileSync("src/lib/media/media-item-summary.ts", "utf8");

describe("saved Roblox media details", () => {
  it("adds saved creation year and creator, without raw genres or categories to the Roblox metadata line", () => {
    assert.match(detailsSource, /getArchiveMediaItemInfoLabels/);
    assert.match(summarySource, /item\.mediaType === "roblox"/);
    assert.match(summarySource, /getDateFactYear\(item\.metadataFacts, "createdAt"\)/);
    assert.doesNotMatch(summarySource, /getNonEmptyStringFact\(item\.metadataFacts, "genre"\)/);
    assert.doesNotMatch(summarySource, /getNonEmptyStringFact\(item\.metadataFacts, "genreLevel1"\)/);
    assert.match(detailsSource, /RobloxCreatorDetails creators=\{item\.entryCreators\}/);
  });

  it("links developers with their role and keeps a legacy fallback without duplication", () => {
    const html = renderToStaticMarkup(createElement(RobloxCreatorDetails, {
      creators: [{ id: 1, name: "Studio", slug: "studio", roleCode: "developer" }, { id: 2, name: "Other", roleCode: "publisher" }],
      facts: { creatorName: "Legacy" }, separatorBefore: true,
    }));
    assert.match(html, /Разработчик:/);
    assert.match(html, /creator=studio&amp;type=roblox/);
    assert.doesNotMatch(html, /Legacy|Other/);
    const legacy = renderToStaticMarkup(createElement(RobloxCreatorDetails, { facts: { creatorName: "Legacy" } }));
    assert.match(legacy, /Разработчик:.*Legacy/);
    assert.doesNotMatch(legacy, /<a /);
    assert.equal(renderToStaticMarkup(createElement(RobloxCreatorDetails, {})), "");
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
