import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { mapTmdbSeasons } from "@/lib/covers/providers/tmdb";
import { runMetadataRefresh, type MetadataJobStore } from "@/lib/media/metadata-jobs";

describe("TMDB title parts", () => {
  it("preserves regular seasons and skips specials before storing poster sources", () => {
    const parts = mapTmdbSeasons([
      { id: 80, season_number: 0, name: "Season Zero", poster_path: "/special.jpg", episode_count: 12 },
      { id: 81, season_number: 1, name: " Season One ", air_date: "2005-09-13", poster_path: "/season.jpg", episode_count: 12 },
      { id: 82, season_number: 1 }, { id: 81, season_number: 2 }, { season_number: 3 }, { id: 83, season_number: -1 },
    ]);
    assert.equal(parts.length, 1);
    assert.equal(parts[0].externalId, "81");
    assert.equal(parts[0].name, "Season One");
    assert.equal(parts[0].year, 2005);
    assert.equal(parts[0].episodeCount, 12);
    assert.equal(parts[0].sortOrder, 1);
    assert.equal(parts[0].posterSourceUrl, "https://image.tmdb.org/t/p/w500/season.jpg");
  });

  it("keeps Russian descriptions and ignores missing or English descriptions", () => {
    const parts = mapTmdbSeasons([
      { id: 1, season_number: 1, overview: "  История доктора Хауса.  " },
      { id: 2, season_number: 2, overview: "An English description." },
      { id: 3, season_number: 3, overview: " " },
      { id: 4, season_number: 4 },
    ]);
    assert.deepEqual(parts.map((part) => part.description), ["История доктора Хауса.", undefined, undefined, undefined]);
  });

  it("passes parts through the existing metadata job store and preserves undefined", async () => {
    const writes: Array<Parameters<MetadataJobStore["upsert"]>[0]> = [];
    const parts = mapTmdbSeasons([{ id: 42, season_number: 1 }]);
    const store: MetadataJobStore = { async upsert(input) { writes.push(input); }, async markAttempt() {}, async logProviderFailure() {} };
    const item = { id: 1, mediaType: "series", platformCode: null, title: "Series", originalTitle: null, releaseYear: null, sourceProvider: "tmdb", sourceExternalId: "5" };
    for (const value of [parts, undefined]) {
      await runMetadataRefresh({ items: [item], store, context: {
        async fetchTitleMetadata() { return { error: null, metadata: { provider: "tmdb", externalId: "5", sourceUrl: null, facts: { seasonCount: 1 }, parts: value } }; },
        async searchTitles() { throw new Error("Should use known source"); },
      } });
    }
    assert.deepEqual(writes[0].parts, parts);
    assert.equal(writes[1].parts, undefined);
  });
});
