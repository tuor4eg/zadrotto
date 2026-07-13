import assert from "node:assert/strict";
import { describe, it } from "node:test";

import { formatMediaItemSummary } from "../src/lib/media/media-item-summary";

describe("media item summary", () => {
  it("formats a film type, release year, and runtime", () => {
    assert.equal(
      formatMediaItemSummary({
        mediaType: "film",
        mediaTypeLabel: "Фильм",
        releaseYear: 1999,
        metadataFacts: { runtimeMinutes: 136 },
      }),
      "Фильм · 1999 · 136 мин.",
    );
  });

  it("formats game developers and genres", () => {
    assert.equal(
      formatMediaItemSummary({
        mediaType: "game",
        mediaTypeLabel: "Игра",
        releaseYear: 2004,
        metadataFacts: {
          developers: ["Valve"],
          genres: ["Шутер", "Головоломка"],
        },
      }),
      "Игра · 2004 · Valve · Шутер, Головоломка",
    );
  });

  it("formats authors for books and comics", () => {
    for (const [mediaType, mediaTypeLabel] of [
      ["book", "Книга"],
      ["comic", "Комикс"],
    ]) {
      assert.equal(
        formatMediaItemSummary({
          mediaType,
          mediaTypeLabel,
          releaseYear: 1986,
          metadataFacts: { authors: ["Алан Мур", "Дэйв Гиббонс"] },
        }),
        `${mediaTypeLabel} · 1986 · Алан Мур, Дэйв Гиббонс`,
      );
    }
  });

  it("formats a series air-year range, counts, and episode runtime", () => {
    assert.equal(
      formatMediaItemSummary({
        mediaType: "series",
        mediaTypeLabel: "Сериал",
        releaseYear: 2010,
        metadataFacts: {
          firstAirYear: 2011,
          lastAirYear: 2015,
          seasonCount: 5,
          episodeCount: 22,
          averageEpisodeRuntimeMinutes: 47,
        },
      }),
      "Сериал · 2011-2015 · 5 сезонов · 22 серии · 47 мин./серия",
    );
  });

  it("uses correct Russian plurals for series counts", () => {
    const cases = [
      [1, 1, "1 сезон · 1 серия"],
      [2, 2, "2 сезона · 2 серии"],
      [5, 5, "5 сезонов · 5 серий"],
    ] as const;

    for (const [seasonCount, episodeCount, expectedCounts] of cases) {
      assert.equal(
        formatMediaItemSummary({
          mediaType: "series",
          mediaTypeLabel: "Сериал",
          releaseYear: null,
          metadataFacts: { seasonCount, episodeCount },
        }),
        `Сериал · ${expectedCounts}`,
      );
    }
  });

  it("keeps at least the type and includes the year when optional facts are missing", () => {
    assert.equal(
      formatMediaItemSummary({
        mediaType: "game",
        mediaTypeLabel: "Игра",
        releaseYear: null,
        metadataFacts: null,
      }),
      "Игра",
    );
    assert.equal(
      formatMediaItemSummary({
        mediaType: "film",
        mediaTypeLabel: "Фильм",
        releaseYear: 1977,
      }),
      "Фильм · 1977",
    );
  });
});
