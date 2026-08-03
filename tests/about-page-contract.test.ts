import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { describe, it } from "node:test";

import { aiProviderRegistry } from "@/lib/ai/registry";
import { COVER_PROVIDER_LABELS } from "@/lib/covers/provider-settings";

const homePageSource = readFileSync("src/app/page.tsx", "utf8");
const aboutPageSource = readFileSync("src/app/about/page.tsx", "utf8");
const coverSourceAttributionSource = readFileSync(
  "src/components/archive/cover-source-attribution.tsx",
  "utf8",
);
const mediaItemDetailsSource = readFileSync("src/app/media-item-details.tsx", "utf8");
const mediaCatalogPreviewSource = readFileSync("src/app/media-catalog-preview.tsx", "utf8");
const mediaTitleCandidatePickerSource = readFileSync(
  "src/components/ui/media-title-candidate-picker.tsx",
  "utf8",
);
const coverPickerSource = readFileSync("src/components/ui/cover-picker.tsx", "utf8");
const googleBooksProviderSource = readFileSync(
  "src/lib/covers/providers/google-books.ts",
  "utf8",
);

describe("about page contracts", () => {
  it("links the footer and discloses registered providers and licenses", () => {
    assert.match(
      homePageSource,
      /<Link[^>]*href="\/about"[^>]*>[\s\S]*?\{label\}[\s\S]*?<\/Link>/,
    );

    const providerNames = new Set([
      ...Object.entries(COVER_PROVIDER_LABELS).map(([code, label]) =>
        code === "comic-vine" ? "Comic Vine" : label,
      ),
      ...aiProviderRegistry.list().map((provider) => provider.label),
    ]);

    for (const providerName of providerNames) {
      assert.ok(
        aboutPageSource.includes(providerName),
        `About page must mention registered provider ${providerName}`,
      );
    }

    assert.ok(
      aboutPageSource.includes(
        "This product uses the TMDB API but is not endorsed or certified by TMDB.",
      ),
    );
    assert.match(aboutPageSource, /GitHub/);
    assert.match(aboutPageSource, /GNU GPLv3/);
  });

  it("links public RAWG and Comic Vine cover attributions to their source pages", () => {
    assert.match(coverSourceAttributionSource, /"comic-vine": "Comic Vine"/);
    assert.match(coverSourceAttributionSource, /rawg: "RAWG"/);
    assert.match(coverSourceAttributionSource, /href=\{pageUrl\}/);
    assert.match(coverSourceAttributionSource, /Обложка: \{providerLabel\}/);

    for (const publicComponentSource of [mediaItemDetailsSource, mediaCatalogPreviewSource]) {
      assert.match(publicComponentSource, /import \{ CoverSourceAttribution \}/);
      assert.match(publicComponentSource, /provider=\{item\.coverSourceProvider\}/);
      assert.match(publicComponentSource, /pageUrl=\{item\.coverSourcePageUrl\}/);
    }
  });

  it("brands visible Google Books picker results and links every candidate source", () => {
    for (const pickerSource of [mediaTitleCandidatePickerSource, coverPickerSource]) {
      assert.match(pickerSource, /hasVisibleGoogleBooksCandidates/);
      assert.match(pickerSource, /candidate\.provider === "google-books"/);
      assert.match(
        pickerSource,
        /https:\/\/books\.google\.com\/googlebooks\/images\/poweredby\.png/,
      );
      assert.match(pickerSource, /alt="Powered by Google"/);
      assert.match(pickerSource, /href=\{candidate\.sourcePageUrl \?\?/);
    }

    assert.match(
      googleBooksProviderSource,
      /https:\/\/books\.google\.com\/books\?id=\$\{encodeURIComponent\(id\)\}/,
    );
    assert.equal(
      (googleBooksProviderSource.match(/getGoogleBookPageUrl\(/g) ?? []).length,
      5,
      "Every Google Books title, metadata and cover mapping must use the page URL fallback",
    );
  });
});
