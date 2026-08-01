import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { describe, it } from "node:test";

import { getAggregatedProviderRequestError } from "@/lib/covers/provider-errors";

const routeSources = [
  "src/app/api/cover-candidates/route.ts",
  "src/app/api/media-title-candidates/route.ts",
  "src/app/api/media-title-metadata/route.ts",
].map((file) => readFileSync(file, "utf8"));
const pickerSources = [
  "src/components/ui/cover-picker.tsx",
  "src/components/ui/media-title-candidate-picker.tsx",
].map((file) => readFileSync(file, "utf8"));
const providerErrorsSource = readFileSync(
  "src/lib/covers/provider-errors.ts",
  "utf8",
);
const mediaFormSources = [
  "src/app/admin/(protected)/media/media-form.tsx",
  "src/app/author/(protected)/media/media-item-form.tsx",
].map((file) => readFileSync(file, "utf8"));

describe("provider search error contracts", () => {
  it("returns daily limits as 429 and unavailable providers as 503", () => {
    for (const source of routeSources) {
      assert.match(source, /error: result\.error/);
      assert.match(
        source,
        /result\.error === "provider-daily-limit" \? 429 : 503/,
      );
    }
  });

  it("shows explicit provider errors through archive toasts", () => {
    for (const source of pickerSources) {
      assert.match(source, /<ArchiveToasts/);
    }
    assert.match(
      providerErrorsSource,
      /"provider-daily-limit": "Суточный лимит провайдера исчерпан\. Попробуйте позже\."/,
    );
    assert.match(
      providerErrorsSource,
      /"provider-unavailable": "Внешний провайдер временно недоступен\. Попробуйте позже\."/,
    );
  });

  it("hides picker toasts when their search input is no longer current", () => {
    assert.match(
      pickerSources[0],
      /shouldSearch && searchError\?\.searchKey === coverSearchKey/,
    );
    assert.match(
      pickerSources[1],
      /canSearch && !shouldSuppressSearch && searchError\?\.searchKey === searchKey/,
    );
    assert.match(pickerSources[0], /key=\{`cover-search-toasts-\$\{coverSearchKey\}-\$\{shouldSearch\}`\}/);
    assert.match(pickerSources[1], /key=\{`title-search-toasts-\$\{searchKey\}-\$\{canSearch\}-\$\{shouldSuppressSearch\}`\}/);
  });

  it("shows metadata provider errors in both admin and author forms", () => {
    for (const source of mediaFormSources) {
      assert.match(source, /isCoverRequestError\(data\.error\)/);
      assert.match(source, /createProviderErrorToast\("metadata-select", result\.error\)/);
      assert.match(source, /createProviderErrorToast\("metadata-refresh", metadataResult\.error\)/);
      assert.match(source, /COVER_REQUEST_ERROR_MESSAGES\[error\]/);
    }
  });

  it("keeps candidate discovery errors structured in both media forms", () => {
    for (const source of mediaFormSources) {
      assert.match(
        source,
        /fetchMediaTitleCandidates[\s\S]*candidates: response\.ok \? data\.candidates \?\? \[\] : \[\][\s\S]*error: isCoverRequestError\(data\.error\) \? data\.error : null/,
      );
      assert.match(
        source,
        /if \(titleCandidatesResult\?\.error\)[\s\S]*createProviderErrorToast\("metadata-refresh", titleCandidatesResult\.error\)/,
      );
    }
  });

  it("guards async metadata error toasts with the current request version", () => {
    for (const source of mediaFormSources) {
      assert.match(
        source,
        /\.then\(\(result\) => \{\s*if \(metadataRequestVersionRef\.current !== requestVersion\) \{\s*return;\s*\}[\s\S]*if \(result\.error\) \{\s*setLocalErrorToast/,
      );
      assert.match(
        source,
        /\.catch\(\(\) => \{\s*if \(metadataRequestVersionRef\.current === requestVersion\) \{\s*setLocalErrorToast/,
      );
    }
  });

  it("continues metadata fallback after provider errors and uses shared priority", () => {
    for (const source of mediaFormSources) {
      assert.match(
        source,
        /providerErrors\.push\(metadataResult\.error\);\s*continue;/,
      );
      assert.match(
        source,
        /getAggregatedProviderRequestError\(providerErrors\)/,
      );
    }

    assert.equal(
      getAggregatedProviderRequestError([
        "provider-unavailable",
        "provider-daily-limit",
        "rate-limit-unavailable",
      ]),
      "rate-limit-unavailable",
    );
    assert.equal(
      getAggregatedProviderRequestError(["provider-unavailable", "provider-daily-limit"]),
      "provider-daily-limit",
    );
  });
});
