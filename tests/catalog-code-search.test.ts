import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { describe, it } from "node:test";

import { normalizeSearchText } from "../src/lib/search/normalize";

const mediaQuerySource = readFileSync("src/db/queries/media-items.ts", "utf8");
const seriesQuerySource = readFileSync("src/db/queries/franchises.ts", "utf8");

function matchesCodeSegment(code: string, query: string) {
  const normalizedSegments = normalizeSearchText(query).replace(/\s+/g, "-").split("-");
  const codeSegments = normalizeSearchText(code).split("-");
  const firstSegmentIndex = codeSegments.indexOf(normalizedSegments[0]);

  return normalizedSegments.every(
    (segment, index) => codeSegments[firstSegmentIndex + index] === segment,
  );
}

describe("catalog code search", () => {
  it("matches a complete hyphen segment without matching the same letters inside another segment", () => {
    assert.equal(matchesCodeSegment("game-deus-ex-human-revolution", "human"), true);
    assert.equal(matchesCodeSegment("film-dzhumandzhi-1995", "human"), false);
  });

  it("uses the hyphen-delimited code pattern in media and series SQL", () => {
    for (const source of [mediaQuerySource, seriesQuerySource]) {
      assert.equal(
        source.includes(
          'const codePattern = `%-${normalizedSearchQuery.replace(/\\s+/g, "-")}-%`;',
        ),
        true,
      );
      assert.equal(
        /sql`\(\'-\' \|\| \$\{normalizeSearchSql\((?:mediaItems|franchises)\.code\)\} \|\| \'-\'\) like \$\{codePattern\}`/.test(
          source,
        ),
        true,
      );
    }
  });

  it("keeps substring matching for media titles, original titles, and aliases", () => {
    assert.match(mediaQuerySource, /containsNormalizedSearchSql\(mediaItems\.title, normalizedSearchQuery\)/);
    assert.match(mediaQuerySource, /containsNormalizedSearchSql\(mediaItems\.originalTitle, normalizedSearchQuery\)/);
    assert.match(
      mediaQuerySource,
      /containsNormalizedSearchSql\(mediaItemTitleAliases\.value, normalizedSearchQuery\)/,
    );
    assert.match(
      seriesQuerySource,
      /with recursive direct_matches as \([\s\S]*normalizeSearchSql/,
    );
    assert.match(
      seriesQuerySource,
      /const normalizedSearchQuery = normalizeSearchText\(input\.searchQuery\)/,
    );
  });
});
