import assert from "node:assert/strict";
import { describe, it } from "node:test";

import { formatMediaItemSummary } from "../src/lib/media/media-item-summary";

describe("media item summary", () => {
  it("formats a film runtime, genres, and production companies", () => {
    assert.equal(
      formatMediaItemSummary({
        mediaType: "film",
        mediaTypeLabel: "Фильм",
        releaseYear: 1995,
        metadataFacts: {
          runtimeMinutes: 104,
          genres: ["Приключения", "Фэнтези", "Семейный"],
          productionCompanies: [
            "TriStar Pictures",
            "Interscope Communications",
            "Teitler Film",
            "PolyGram Filmed Entertainment",
          ],
        },
      }),
      "Фильм · 1995 · 104 мин. · Приключения, Фэнтези, Семейный · TriStar Pictures, Interscope Communications, Teitler Film, PolyGram Filmed Entertainment",
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

  it("formats comic authors, issue count, and publisher", () => {
    assert.equal(
      formatMediaItemSummary({
        mediaType: "comic",
        mediaTypeLabel: "Комикс",
        releaseYear: 1986,
        metadataFacts: {
          authors: ["Алан Мур", "Дэйв Гиббонс"],
          issueCount: 12,
          publisher: "DC Comics",
        },
      }),
      "Комикс · 1986 · Алан Мур, Дэйв Гиббонс · 12 выпусков · DC Comics",
    );
  });

  it("uses correct Russian plurals and skips invalid optional comic facts", () => {
    const cases = [
      [1, "1 выпуск"],
      [2, "2 выпуска"],
      [5, "5 выпусков"],
      [11, "11 выпусков"],
      [21, "21 выпуск"],
      [22, "22 выпуска"],
    ] as const;

    for (const [issueCount, expectedCount] of cases) {
      assert.equal(
        formatMediaItemSummary({
          mediaType: "comic",
          mediaTypeLabel: "Комикс",
          releaseYear: null,
          metadataFacts: { issueCount, publisher: " " },
        }),
        `Комикс · ${expectedCount}`,
      );
    }

    assert.equal(
      formatMediaItemSummary({
        mediaType: "comic",
        mediaTypeLabel: "Комикс",
        releaseYear: null,
        metadataFacts: { issueCount: null, publisher: null },
      }),
      "Комикс",
    );

    for (const issueCount of [0, -1, 1.5, "12"]) {
      assert.equal(
        formatMediaItemSummary({
          mediaType: "comic",
          mediaTypeLabel: "Комикс",
          releaseYear: null,
          metadataFacts: { issueCount, publisher: 42 },
        }),
        "Комикс",
      );
    }

    assert.equal(
      formatMediaItemSummary({
        mediaType: "comic",
        mediaTypeLabel: "Комикс",
        releaseYear: null,
        metadataFacts: { publisher: "  DC Comics  " },
      }),
      "Комикс · DC Comics",
    );
  });

  it("formats a series air-year range, counts, episode runtime, genres, and networks", () => {
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
          genres: ["Драма", "Криминал"],
          networks: ["AMC"],
        },
      }),
      "Сериал · 2011-2015 · 5 сезонов · 22 серии · 47 мин./серия · Драма, Криминал · AMC",
    );
  });

  it("skips empty and invalid film and series list facts", () => {
    assert.equal(
      formatMediaItemSummary({
        mediaType: "film",
        mediaTypeLabel: "Фильм",
        releaseYear: 1995,
        metadataFacts: {
          runtimeMinutes: 0,
          genres: ["", null, 42],
          productionCompanies: "TriStar Pictures",
        },
      }),
      "Фильм · 1995",
    );

    assert.equal(
      formatMediaItemSummary({
        mediaType: "series",
        mediaTypeLabel: "Сериал",
        releaseYear: null,
        metadataFacts: {
          seasonCount: 0,
          episodeCount: "22",
          averageEpisodeRuntimeMinutes: null,
          genres: null,
          networks: [" ", 42],
        },
      }),
      "Сериал",
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

  it("formats anime TV format, episode count, studios, and genres", () => {
    assert.equal(
      formatMediaItemSummary({
        mediaType: "anime",
        mediaTypeLabel: "Аниме",
        releaseYear: 2013,
        metadataFacts: {
          animeType: "TV",
          episodeCount: 25,
          averageEpisodeRuntimeMinutes: 24,
          studios: ["WIT STUDIO", "Production I.G", "MAPPA", "CloverWorks"],
          genres: ["Action", "Adventure", "Drama", "Fantasy"],
        },
      }),
      "Аниме · 2013 · TV · 25 серий · WIT STUDIO, Production I.G, MAPPA, CloverWorks · Action, Adventure, Drama, Fantasy",
    );
  });

  it("formats anime movies with duration instead of episode count", () => {
    assert.equal(
      formatMediaItemSummary({
        mediaType: "anime",
        mediaTypeLabel: "Аниме",
        releaseYear: 2004,
        metadataFacts: {
          animeType: "MOVIE",
          episodeCount: 1,
          averageEpisodeRuntimeMinutes: 126,
          studios: ["Sunrise"],
          genres: ["Adventure", "Sci-Fi"],
        },
      }),
      "Аниме · 2004 · MOVIE · 126 мин. · Sunrise · Adventure, Sci-Fi",
    );
  });

  it("skips missing and invalid optional anime facts while preserving valid partial facts", () => {
    assert.equal(
      formatMediaItemSummary({
        mediaType: "anime",
        mediaTypeLabel: "Аниме",
        releaseYear: null,
        metadataFacts: null,
      }),
      "Аниме",
    );

    assert.equal(
      formatMediaItemSummary({
        mediaType: "anime",
        mediaTypeLabel: "Аниме",
        releaseYear: 1995,
        metadataFacts: {
          animeType: " ",
          episodeCount: 0,
          averageEpisodeRuntimeMinutes: "24",
          studios: "Gainax",
          genres: ["Drama", "", 42, " Drama "],
        },
      }),
      "Аниме · 1995 · Drama",
    );
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
