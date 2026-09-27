import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { describe, it } from "node:test";

const catalogSource = readFileSync("src/app/media-items-catalog.tsx", "utf8");
const tabsSource = readFileSync("src/app/media-type-tabs.tsx", "utf8");
const globalsSource = readFileSync("src/app/globals.css", "utf8");

describe("catalog media type tabs", () => {
  it("keeps only the selected and positive-count media types available", () => {
    assert.match(
      catalogSource,
      /mediaType\.code === mediaTypeFilter \|\|[\s\S]*mediaTypeCountRows\.some\(\(item\) => item\.mediaType === mediaType\.code && item\.count > 0\)/,
    );
  });

  it("always includes the all tab when there are matching results", () => {
    assert.match(
      tabsSource,
      /const tabs = useMemo<MediaTypeTabItem\[]>\([\s\S]*label: "Все"[\s\S]*value: "all"[\s\S]*availableMediaTypes\.map/,
    );
    assert.doesNotMatch(tabsSource, /availableMediaTypes\.length === 1/);
  });

  it("keeps tabs visible when the selected type is empty but other types match", () => {
    assert.match(
      catalogSource,
      /const archiveTotalCount = useMemo\([\s\S]*mediaTypeCountRows\.reduce\(\(total, item\) => total \+ item\.count, 0\)/,
    );
    assert.match(
      catalogSource,
      /toolbar=\{[\s\S]*archiveTotalCount > 0 \? \([\s\S]*<MediaTypeTabs/,
    );
    assert.doesNotMatch(
      catalogSource,
      /toolbar=\{[\s\S]*items\.length > 0 \? \([\s\S]*<MediaTypeTabs/,
    );
  });

  it("preserves active filters and resets pagination when changing media type", () => {
    assert.match(
      catalogSource,
      /const nextSearchParams = new URLSearchParams\(searchParams\.toString\(\)\);[\s\S]*nextSearchParams\.delete\("page"\);/,
    );
    assert.match(
      catalogSource,
      /updateFilterParam\(nextSearchParams, "type", nextFilters\.type, "all"\)/,
    );
    assert.doesNotMatch(
      catalogSource,
      /nextSearchParams\.delete\("(?:q|year|yearMode|mine)"\)/,
    );
  });

  it("sizes desktop tabs from the longest label and count with minimal overlap", () => {
    assert.match(tabsSource, /longestTabValueLength = Math.max/);
    assert.match(tabsSource, /\[tab\.label, tab\.count\]\.join\(" "\)\.length/);
    assert.match(tabsSource, /--archive-media-type-tab-width/);
    assert.match(tabsSource, /lg:w-auto lg:min-w-\[var\(--archive-media-type-tab-width\)\] lg:flex-1 lg:basis-\[var\(--archive-media-type-tab-width\)\]/);
    assert.match(tabsSource, /whitespace-nowrap lg:w-full/);
    assert.match(tabsSource, /index > 0 && "lg:-ml-4"/);
    assert.doesNotMatch(tabsSource, /lg:inline-grid|lg:grow|lg:max-w-\[220px\]|lg:px-6/);
  });

  it("mirrors the separating shadow for tabs before the selected tab", () => {
    assert.match(tabsSource, /index < selectedIndex && "archive-media-type-tab-before-active"/);
    assert.match(
      globalsSource,
      /\.archive-media-type-tab-before-active::after\s*\{[\s\S]*right: auto;[\s\S]*left: -10px;/,
    );
  });
});
