import assert from "node:assert/strict";
import { test } from "node:test";
import { getMediaTitleMetadataFormFields } from "../src/lib/media/title-candidate-form";
import { describeTmdbFilmSource, normalizeTmdbFilmSnapshot } from "../src/lib/providers/tmdb-film-adapter";

const payload = {
  id: 42,
  title: "Название фильма",
  original_title: "Original film",
  release_date: "2001-04-12",
  overview: "Полное описание",
  runtime: 123,
  genres: [{ id: 18, name: " Драма " }],
  production_countries: [{ name: " Франция ", iso_3166_1: "FR" }, { iso_3166_1: "DE" }],
  original_language: "fr",
  production_companies: [{ id: 7, name: " Studio " }, { id: 8, name: "Studio" }],
  credits: { cast: [{ id: 9, name: "Актёр" }], crew: [{ id: 10, name: "Режиссёр", job: "Director" }] },
  future_tmdb_field: { untouched: true },
};

test("TMDB film projects existing compact facts without processing credits or changing raw", () => {
  const snapshot = { ...describeTmdbFilmSource("42"), payload: structuredClone(payload) };
  const before = structuredClone(snapshot);
  const projection = normalizeTmdbFilmSnapshot(snapshot);

  assert.equal(projection.provider, "tmdb");
  assert.equal(projection.externalId, "42");
  assert.equal(projection.sourceUrl, "https://www.themoviedb.org/movie/42");
  assert.deepEqual(projection.facts, {
    runtimeMinutes: 123,
    productionCountries: ["Франция", "DE"],
    originalLanguage: "fr",
    productionCompanies: ["Studio"],
  });
  assert.deepEqual(projection.genreFacts, { genres: ["Драма"], genreReferences: [{ id: "18", name: "Драма" }] });
  assert.equal("contributors" in projection, false);
  assert.deepEqual(snapshot, before);
});

test("TMDB film rejects invalid IDs, another provider and mismatched raw identity", () => {
  for (const id of ["0", "-1", "1.5", "movie/42", "https://example.com/42"]) {
    assert.throws(() => describeTmdbFilmSource(id));
  }
  const snapshot = { ...describeTmdbFilmSource("42"), payload };
  assert.throws(() => normalizeTmdbFilmSnapshot({ ...snapshot, payload: { ...payload, id: 43 } }));
  assert.throws(() => normalizeTmdbFilmSnapshot({ ...snapshot, providerCode: "jikan" }));
  assert.throws(() => normalizeTmdbFilmSnapshot({ ...snapshot, payload: [] }));
});

test("TMDB film detail fields reach the existing form and preserve manual values", () => {
  const projection = normalizeTmdbFilmSnapshot({ ...describeTmdbFilmSource("42"), payload });
  const selected = { title: "Search title", originalTitle: "Search original", releaseYear: "1901", description: "Search summary" };
  assert.deepEqual(getMediaTitleMetadataFormFields(projection.fields, selected, false), {
    title: payload.title, originalTitle: payload.original_title, releaseYear: "2001", description: payload.overview,
  });
  assert.deepEqual(getMediaTitleMetadataFormFields(projection.fields, selected, true), selected);
  const incomplete = normalizeTmdbFilmSnapshot({ ...describeTmdbFilmSource("42"), payload: {
    id: 42, runtime: null, genres: [], production_countries: [], production_companies: [], original_language: null,
    credits: { cast: [], crew: [] },
  } });
  assert.deepEqual(getMediaTitleMetadataFormFields(incomplete.fields, selected, false), selected);
  assert.deepEqual(incomplete.facts, {});
});

test("TMDB film refuses partial responses before replacing existing facts", () => {
  const descriptor = describeTmdbFilmSource("42");
  assert.throws(() => normalizeTmdbFilmSnapshot({ ...descriptor, payload: { id: 42 } }), /INCOMPLETE_PROVIDER_SNAPSHOTS/);
  assert.throws(() => normalizeTmdbFilmSnapshot({ ...descriptor, payload: { ...payload, credits: null } }), /INCOMPLETE_PROVIDER_SNAPSHOTS/);
});
