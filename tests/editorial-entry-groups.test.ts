import assert from "node:assert/strict";
import { describe, it } from "node:test";
import {
  assertEditorialDocumentBlocks,
  getEditorialDocumentMediaIds,
  parseEditorialDocumentBlocks,
  type EditorialDocumentBlockInput,
} from "../src/lib/editorial-documents/model";
import { getEntryGroupSummary } from "../src/lib/editorial-documents/entry-group-summary";

const group = (mediaItemIds: number[]): EditorialDocumentBlockInput => ({
  type: "entry_group", title: null, description: null, mediaItemIds,
});
const film = (runtimeMinutes: unknown = 90) => ({
  mediaType: "film", mediaTypeName: "Фильм", metadataFacts: { runtimeMinutes },
});

describe("editorial entry group input", () => {
  it("round-trips mixed blocks and preserves participant order while normalizing optional text", () => {
    const blocks = parseEditorialDocumentBlocks(JSON.stringify([
      { type: "heading", content: "Раздел" },
      { type: "entry_group", title: "  Подборка  ", description: " \n ", mediaItemIds: [9, 3, 7] },
      { type: "media", mediaItemId: 4, editorialComment: "  заметка  " },
      { type: "text", content: "После набора" },
    ]));
    assert.deepEqual(blocks[1], { type: "entry_group", title: "Подборка", description: null, mediaItemIds: [9, 3, 7] });
    assert.deepEqual(getEditorialDocumentMediaIds(blocks), [9, 3, 7, 4]);
    assert.deepEqual(parseEditorialDocumentBlocks(JSON.stringify(blocks)), blocks);
    assert.doesNotThrow(() => assertEditorialDocumentBlocks([group([1])]));
    assert.throws(() => assertEditorialDocumentBlocks([group([])]), /group-empty/);
  });

  it("counts all participants toward the 200 entry limit and each group toward the 300 block limit", () => {
    const ids = Array.from({ length: 200 }, (_, index) => index + 1);
    assert.doesNotThrow(() => assertEditorialDocumentBlocks([group(ids.slice(0, 100)), group(ids.slice(100))]));
    assert.throws(() => assertEditorialDocumentBlocks([group(ids), { type: "media", mediaItemId: 201, editorialComment: null }]), /media-blocks-limit/);
    const text: EditorialDocumentBlockInput = { type: "text", content: "Текст" };
    assert.doesNotThrow(() => assertEditorialDocumentBlocks([group([1]), ...Array.from({ length: 299 }, () => text)]));
    assert.throws(() => assertEditorialDocumentBlocks([group([1]), ...Array.from({ length: 300 }, () => text)]), /blocks-limit/);
  });

  it("rejects duplicates within a group and across groups and single entries", () => {
    for (const blocks of [
      [group([1, 1])],
      [group([1]), group([1])],
      [group([1]), { type: "media" as const, mediaItemId: 1, editorialComment: null }],
    ]) assert.throws(() => assertEditorialDocumentBlocks(blocks), /blocks-invalid/);
  });

  it("enforces optional group text limits", () => {
    assert.doesNotThrow(() => parseEditorialDocumentBlocks(JSON.stringify([{ ...group([1]), title: "x".repeat(200), description: "x".repeat(5000) }])));
    assert.throws(() => parseEditorialDocumentBlocks(JSON.stringify([{ ...group([1]), title: "x".repeat(201) }])), /group-title-length/);
    assert.throws(() => parseEditorialDocumentBlocks(JSON.stringify([{ ...group([1]), description: "x".repeat(5001) }])), /group-description-length/);
  });

  it("rejects malformed JSON, unknown blocks and non-positive or unsafe participant IDs", () => {
    for (const value of ["{", "{}", "[null]", '[{"type":"unknown"}]',
      JSON.stringify([{ ...group([1]), title: 3 }]),
      JSON.stringify([{ ...group([1]), description: [] }]),
      JSON.stringify([{ ...group([1]), mediaItemIds: "1" }]),
    ]) assert.throws(() => parseEditorialDocumentBlocks(value), /blocks-invalid/);
    for (const id of [0, -1, 1.5, Number.MAX_SAFE_INTEGER + 1, "1", true, null]) {
      assert.throws(() => parseEditorialDocumentBlocks(JSON.stringify([{ ...group([]), mediaItemIds: [id] }])), /blocks-invalid/);
    }
  });
});

describe("entry group summary", () => {
  it("uses Russian plurals and first-appearance type order", () => {
    for (const [count, noun] of [[1, "фильм"], [2, "фильма"], [5, "фильмов"], [11, "фильмов"], [21, "фильм"]] as const) {
      assert.equal(getEntryGroupSummary(Array.from({ length: count }, () => film())).composition, `${count} ${noun}`);
    }
    const summary = getEntryGroupSummary([
      { mediaType: "book", mediaTypeName: "Книга", metadataFacts: null }, film(),
      { mediaType: "book", mediaTypeName: "Книга", metadataFacts: null },
      { mediaType: "custom", mediaTypeName: "Особый тип", metadataFacts: null },
    ]);
    assert.equal(summary.label, "2 книги · 1 фильм · Особый тип: 1");
    assert.equal(summary.totalMinutes, null);
  });

  it("sums films, series and anime using their distinct runtime semantics", () => {
    const summary = getEntryGroupSummary([
      film(95),
      { mediaType: "series", mediaTypeName: "Сериал", metadataFacts: { episodeCount: 10, averageEpisodeRuntimeMinutes: 40, lastAirYear: 2025 } },
      { mediaType: "anime", mediaTypeName: "Аниме", metadataFacts: { animeType: "MOVIE", averageEpisodeRuntimeMinutes: 120, episodeCount: 7 } },
      { mediaType: "anime", mediaTypeName: "Аниме", metadataFacts: { animeType: "TV", episodeCount: 10, averageEpisodeRuntimeMinutes: 26 } },
    ]);
    assert.equal(summary.totalMinutes, 875);
    assert.equal(summary.durationLabel, "14 ч 35 мин");
    assert.equal(summary.label, "1 фильм · 1 сериал · 2 аниме · 14 ч 35 мин");
    assert.equal(getEntryGroupSummary([film(120)]).durationLabel, "2 ч");
    assert.equal(getEntryGroupSummary([film(35)]).durationLabel, "35 мин");
    assert.equal(getEntryGroupSummary([{ mediaType: "series", mediaTypeName: "Сериал", metadataFacts: { episodeCount: 2, averageEpisodeRuntimeMinutes: 30 } }]).durationLabel, "1 ч по данным каталога");
  });

  it("omits duration for missing, unsupported, invalid or overflowing metadata", () => {
    for (const item of [
      { ...film(), metadataFacts: null },
      ...["book", "game", "boardgame", "custom"].map((mediaType) => ({ ...film(), mediaType })),
      ...[0, -1, 1.5, "90", Number.NaN, Infinity, Number.MAX_SAFE_INTEGER + 1].map(film),
      { mediaType: "series", mediaTypeName: "Сериал", metadataFacts: { episodeCount: Number.MAX_SAFE_INTEGER, averageEpisodeRuntimeMinutes: 2 } },
      { mediaType: "anime", mediaTypeName: "Аниме", metadataFacts: { averageEpisodeRuntimeMinutes: 20 } },
    ]) {
      const summary = getEntryGroupSummary([film(), item]);
      assert.equal(summary.totalMinutes, null);
      assert.equal(summary.durationLabel, null);
      assert.equal(summary.label, summary.composition);
    }
    assert.equal(getEntryGroupSummary([film(Number.MAX_SAFE_INTEGER), film(1)]).totalMinutes, null);
    assert.deepEqual(getEntryGroupSummary([]), { composition: "", totalMinutes: null, durationLabel: null, label: "" });
  });
});
