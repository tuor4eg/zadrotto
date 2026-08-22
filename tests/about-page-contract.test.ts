import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { describe, it } from "node:test";

import { aiProviderRegistry } from "@/lib/ai/registry";
import { COVER_PROVIDER_LABELS } from "@/lib/covers/provider-settings";

const homePageSource = readFileSync("src/app/page.tsx", "utf8");
const aboutPageSource = readFileSync("src/app/about/page.tsx", "utf8");
const rulesPageSource = readFileSync("src/app/rules/page.tsx", "utf8");
const helpPageSource = readFileSync("src/app/help/page.tsx", "utf8");
const feedbackPageSource = readFileSync("src/app/feedback/page.tsx", "utf8");
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

const informationalPageSources = [
  aboutPageSource,
  rulesPageSource,
  helpPageSource,
  feedbackPageSource,
];

describe("informational page shell contracts", () => {
  it("aligns the header with the home page and relies on the brand link for navigation home", () => {
    for (const pageSource of informationalPageSources) {
      assert.match(pageSource, /px-3 pb-3 pt-3[^\"]*sm:px-5 sm:pb-5 lg:px-7 lg:pb-7/);
      assert.doesNotMatch(pageSource, /aria-label="Хлебные крошки"/);
      assert.doesNotMatch(pageSource, />\s*Главная\s*</);
    }
  });

  it("aligns the lead illustration with the page title", () => {
    for (const pageSource of informationalPageSources) {
      assert.match(
        pageSource,
        /<article[^>]*>[\s\S]*<div className="grid[^\"]*sm:grid-cols-\[minmax\(0,1fr\)_auto\][^\"]*">[\s\S]*<h1[\s\S]*<Image/,
      );
    }
  });
});

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
    assert.match(
      aboutPageSource,
      /<Image[\s\S]*className="h-9 w-auto max-w-full"[\s\S]*src="\/tmdb-logo\.svg"/,
    );
    assert.match(aboutPageSource, /GitHub/);
    assert.match(aboutPageSource, /GNU GPLv3/);
    assert.match(
      aboutPageSource,
      /sm:grid-cols-\[minmax\(0,1fr\)_auto\][\s\S]*src="\/mascot\/deadz\.png"[\s\S]*unoptimized/,
    );
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

describe("rules page contracts", () => {
  it("links the footer and explains automatic and manual record data", () => {
    assert.match(homePageSource, /<Link[^>]*href="\/rules"[^>]*>/);
    assert.match(rulesPageSource, /Правила архива/);
    assert.match(rulesPageSource, /sm:grid-cols-\[minmax\(0,1fr\)_auto\]/);
    assert.match(rulesPageSource, /src="\/mascot\/deadz_rulez\.png"/);
    assert.match(rulesPageSource, /архив получает из публичных баз данных/);
    assert.match(rulesPageSource, /запись можно заполнить вручную/);
    assert.match(rulesPageSource, /Рецензии проходят проверку перед публикацией/);
  });
});

describe("help page contracts", () => {
  it("links the footer and explains the primary and alternative suggestion flows", () => {
    assert.match(homePageSource, /<Link[^>]*href="\/help"[^>]*>/);
    assert.match(helpPageSource, /sm:grid-cols-\[minmax\(0,1fr\)_auto\]/);
    assert.match(helpPageSource, /src="\/mascot\/deadz_faq\.png"/);
    assert.match(helpPageSource, /Как добавить то, чего ещё нет в архиве\?/);
    assert.match(helpPageSource, /кнопку «\+» в левом нижнем углу/);
    assert.match(helpPageSource, /кабинет автора → «Предложения» → «Записи» → «Добавить»/);
    assert.match(helpPageSource, /href="\/archive"/);
    assert.match(helpPageSource, /href="\/rules"/);
  });
});

describe("feedback page contracts", () => {
  it("links the footer to the public Telegram contact", () => {
    assert.match(homePageSource, /<Link[^>]*href="\/feedback"[^>]*>/);
    assert.match(feedbackPageSource, /Обратная связь/);
    assert.match(feedbackPageSource, /sm:grid-cols-\[minmax\(0,1fr\)_auto\]/);
    assert.match(feedbackPageSource, /src="\/mascot\/deadz_contact\.png"/);
    assert.match(feedbackPageSource, /href="https:\/\/t\.me\/zadrotto"/);
    assert.match(feedbackPageSource, /target="_blank"/);
    assert.match(feedbackPageSource, /rel="noreferrer"/);
  });
});
