import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { describe, it } from "node:test";

const catalogSearchSource = readFileSync("src/app/catalog-header-controls.tsx", "utf8");
const seriesSearchSource = readFileSync("src/app/series/series-search.tsx", "utf8");

function assertSearchRaceContract(source: string, replaceCallPattern: RegExp) {
  assert.match(
    source,
    /const handleSearch = useCallback\([\s\S]*const normalizedQuery = query\.trim\(\);[\s\S]*const currentUrlQuery = searchParams\.get\("q"\)\?\.trim\(\) \?\? "";/,
  );
  assert.match(
    source,
    /if \(normalizedQuery === currentUrlQuery && normalizedQuery !== searchQuery\) \{[\s\S]*startTransition\(\(\) => \{[\s\S]*router\.refresh\(\);[\s\S]*\}\);[\s\S]*return;[\s\S]*\}/,
  );
  assert.match(source, replaceCallPattern);
  assert.match(
    source,
    /useDebouncedSearchDraft\(\{[\s\S]*searchQuery,[\s\S]*onSearch: handleSearch/,
  );
  assert.match(
    source,
    /\[([^\]]*\brouter\b[^\]]*\bsearchParams\b[^\]]*\bsearchQuery\b|[^\]]*\bsearchParams\b[^\]]*\bsearchQuery\b[^\]]*\brouter\b)[^\]]*\]/,
  );
}

describe("debounced catalog search race", () => {
  it("refreshes the main catalog when draft and URL agree but server results lag", () => {
    assertSearchRaceContract(catalogSearchSource, /replaceFilters\(\{ q: query \}\);/);
  });

  it("refreshes series search when draft and URL agree but server results lag", () => {
    assertSearchRaceContract(seriesSearchSource, /replaceSearch\(query\);/);
  });
});
