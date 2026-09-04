import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { describe, it } from "node:test";

import { getRelatedFranchiseSectionSources } from "@/lib/media/related-franchises";

const details = readFileSync("src/app/media-item-details.tsx", "utf8");
const mediaItemsQuery = readFileSync("src/db/queries/media-items.ts", "utf8");
const page = readFileSync("src/app/media/[code]/page.tsx", "utf8");

describe("public media related series", () => {
  it("starts the record breadcrumb from its media type", () => {
    assert.match(
      page,
      /aria-label="Хлебные крошки"[\s\S]*href=\{`\/archive\?type=\$\{encodeURIComponent\(item\.mediaType\)\}`\}/,
    );
    assert.doesNotMatch(page, />\s*(?:Главная|Архив)\s*</);
  });

  it("builds direct sections before unique nearest-first ancestor sections", () => {
    const root = { id: 1, code: "root", title: "Root" };
    const parentA = { id: 2, code: "parent-a", title: "Parent A" };
    const parentB = { id: 3, code: "parent-b", title: "Parent B" };
    const directA = {
      id: 4,
      code: "direct-a",
      title: "Direct A",
      publicationStatus: "published" as const,
      path: [root, parentA, { id: 4, code: "direct-a", title: "Direct A" }],
    };
    const directB = {
      id: 5,
      code: "direct-b",
      title: "Direct B",
      publicationStatus: "published" as const,
      path: [root, parentB, { id: 5, code: "direct-b", title: "Direct B" }],
    };

    const sources = getRelatedFranchiseSectionSources([directA, directB]);

    assert.deepEqual(
      sources.map((source) => source.franchise.code),
      ["direct-a", "direct-b", "parent-a", "parent-b", "root"],
    );
    assert.equal(
      sources.filter((source) => source.franchise.id === root.id).length,
      1,
    );
    assert.match(page, /getRelatedFranchiseSections\(\{/);
  });

  it("searches parent sections through published descendants and avoids duplicate cards", () => {
    assert.match(mediaItemsQuery, /with recursive published_descendants/);
    assert.match(
      mediaItemsQuery,
      /where \$\{franchises\.id\} in \$\{franchiseIds\}[\s\S]*and \$\{franchises\.publicationStatus\} = \$\{PUBLISHED_PUBLICATION_STATUS\}/,
    );
    assert.match(
      mediaItemsQuery,
      /where child\.publication_status = \$\{PUBLISHED_PUBLICATION_STATUS\}/,
    );
    assert.match(
      mediaItemsQuery,
      /not\(inArray\(mediaItems\.id, \[\.\.\.excludedMediaItemIds\]\)\)/,
    );
    assert.match(mediaItemsQuery, /shownMediaItemIds\.add\(item\.id\)/);
  });

  it("keeps only published related records from enabled media types and excludes the current record", () => {
    assert.match(
      mediaItemsQuery,
      /ne\(mediaItems\.id, currentMediaItemId\)[\s\S]*eq\(mediaItemFranchises\.publicationStatus, PUBLISHED_PUBLICATION_STATUS\)[\s\S]*publishedMediaItemCondition[\s\S]*getMediaTypeCodeFilterSql\(mediaItems\.mediaType, enabledMediaTypeCodes\)/,
    );
    assert.match(
      mediaItemsQuery,
      /getOtherMediaItemsFromFranchises\([\s\S]*input\.currentMediaItemId[\s\S]*input\.enabledMediaTypeCodes/,
    );
  });

  it("deduplicates direct-series cards before parent-series cards", () => {
    assert.match(
      mediaItemsQuery,
      /section\.includeDescendants,[\s\S]*\[\.\.\.shownMediaItemIds\]/,
    );
  });

  it("drops empty direct and parent sections from the rendered dossier", () => {
    assert.match(
      details,
      /resolvedRelatedFranchiseSections[\s\S]*\.filter\(\(section\) => section\.items\.length > 0\)/,
    );
  });

  it("keeps the related-section heading shape UI-specific", () => {
    assert.match(
      details,
      /franchise: Pick<MediaItemDetailsItem\["franchises"\]\[number\], "id" \| "code" \| "title">/,
    );
  });
});
