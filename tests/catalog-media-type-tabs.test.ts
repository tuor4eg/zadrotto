import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { describe, it } from "node:test";

const catalogSource = readFileSync("src/app/media-items-catalog.tsx", "utf8");
const tabsSource = readFileSync("src/app/media-type-tabs.tsx", "utf8");

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
});
