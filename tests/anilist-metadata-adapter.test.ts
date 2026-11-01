import assert from "node:assert/strict";
import test from "node:test";
import { describeAniListMetadata, normalizeAniListMetadata } from "../src/lib/providers/anilist-metadata-adapter";
import type { JSONValue } from "../src/lib/providers/types";

const media = { id: 101, idMal: 201, episodes: 12, duration: 24, status: "FINISHED", format: "TV", genres: ["Action", "Action"],
  title: { english: "English", romaji: "Romaji", native: "日本語" }, seasonYear: 2020, description: "Description", unknown: { preserved: true } };
const snapshot = (value: unknown) => ({ ...describeAniListMetadata("101"), payload: value as JSONValue });

test("AniList primary projection derives characteristics and genres from the complete GraphQL envelope", () => {
  const result = normalizeAniListMetadata(snapshot({ data: { Media: media } }));
  assert.deepEqual(result.facts, { episodeCount: 12, averageEpisodeRuntimeMinutes: 24, status: "FINISHED", animeType: "TV" });
  assert.deepEqual(result.genreFacts, { genres: ["Action"] });
  assert.deepEqual(result.fields, { title: "English", originalTitle: "Romaji", releaseYear: 2020, description: "Description" });
  assert.equal(result.sourceUrl, "https://anilist.co/anime/101");
  assert.equal(describeAniListMetadata("101").apiMethod, "anime.details");
});

test("AniList accepts explicit unknown characteristics and an empty genre list", () => {
  const result = normalizeAniListMetadata(snapshot({ data: { Media: { ...media, episodes: null, duration: null, status: null, format: null, genres: [] } } }));
  assert.deepEqual(result.facts, {});
  assert.deepEqual(result.genreFacts, { genres: [] });
  assert.deepEqual(normalizeAniListMetadata(snapshot({ data: { Media: { ...media, genres: null } } })).genreFacts, { genres: [] });
});

test("AniList rejects partial GraphQL responses, wrong identities and malformed characteristics", () => {
  for (const value of [
    { errors: [{ message: "partial" }], data: { Media: media } }, { data: { Media: null } }, { data: { Media: { ...media, id: 102 } } },
    { data: { Media: { ...media, episodes: undefined } } }, { data: { Media: { ...media, duration: -1 } } },
    { data: { Media: { ...media, format: [] } } }, { data: { Media: { ...media, genres: [5] } } },
    { mediaId: 101, complete: true, staff: [], studios: [] },
  ]) assert.throws(() => normalizeAniListMetadata(snapshot(value)));
  for (const id of ["0", "-1", "01", "9007199254740993"]) assert.throws(() => describeAniListMetadata(id));
});
