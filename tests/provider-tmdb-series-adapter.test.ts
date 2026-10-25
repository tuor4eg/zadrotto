import assert from "node:assert/strict";
import test from "node:test";
import { describeTmdbSeriesSource, extractTmdbSeriesCreatorReferences, normalizeTmdbSeriesSnapshot } from "../src/lib/providers/tmdb-series-adapter";
import { parseSnapshotJobPayload } from "../src/lib/providers/snapshot-job-payload";

const payload = {
  id: 42, name: "Сериал", original_name: "Series", first_air_date: "2001-04-12", last_air_date: "2003-01-01", overview: "Описание",
  number_of_seasons: 2, number_of_episodes: 30, episode_run_time: [40, 42], genres: [{ id: 18, name: "Драма" }],
  production_companies: [{ id: 7, name: "Studio", logo_path: null }], networks: [{ id: 7, name: "Network", logo_path: null }],
  created_by: [{ id: 9, name: "Creator" }], aggregate_credits: { cast: [], crew: [
    { id: 10, name: "Explicit", jobs: [{ job: "Showrunner" }] }, { id: 11, name: "Writer", jobs: [{ job: "Writer" }, { job: "Executive Producer" }] },
  ] }, seasons: [{ id: 70, season_number: 1, name: "Сезон 1", episode_count: 15, air_date: "2001-04-12", poster_path: "/poster.jpg" }],
};
const snapshot = () => ({ ...describeTmdbSeriesSource("42"), payload: structuredClone(payload) });

test("TV descriptor and complete rosters remain immutable and keep resource namespaces", () => {
  const raw = snapshot();
  const before = structuredClone(raw);
  const result = normalizeTmdbSeriesSnapshot(raw);
  assert.deepEqual(raw, before);
  assert.equal(raw.apiMethod, "tv.details");
  assert.equal(raw.requestParams.append_to_response, "aggregate_credits");
  assert.equal(result.creatorReferences.companies[0].externalId, "company:7");
  assert.equal(result.creatorReferences.networks[0].externalId, "network:7");
  assert.deepEqual(result.creatorReferences.showrunners.map(ref => ref.externalId), ["person:10"]);
  assert.equal(result.creatorReferences.creators[0].roleCode, "creator");
  assert.deepEqual(result.facts, { seasonCount: 2, episodeCount: 30, averageEpisodeRuntimeMinutes: 41, firstAirYear: 2001, lastAirYear: 2003 });
  assert.equal(result.parts[0].externalId, "70");
  assert.equal(result.fields.title, "Сериал");
  assert.deepEqual(result.genreFacts.genres, ["Драма"]);
});

test("valid empty rosters are authoritative; missing, malformed and conflicting evidence rejects", () => {
  const empty = { ...payload, production_companies: [], networks: [], created_by: [], aggregate_credits: { cast: [], crew: [] } };
  assert.deepEqual(extractTmdbSeriesCreatorReferences({ ...snapshot(), payload: empty }), { companies: [], networks: [], creators: [], showrunners: [] });
  for (const patch of [{ networks: null }, { created_by: undefined }, { production_companies: [{ id: -1, name: "Bad" }] },
    { aggregate_credits: { cast: [], crew: [{ id: 2, name: "Bad", jobs: null }] } },
    { networks: [{ id: 1, name: "First" }, { id: 1, name: "Conflicting" }] }]) {
    assert.throws(() => extractTmdbSeriesCreatorReferences({ ...snapshot(), payload: { ...payload, ...patch } as never }));
  }
  assert.throws(() => normalizeTmdbSeriesSnapshot({ ...snapshot(), payload: { ...payload, id: 43 } }));
});

test("series scope supports all operations without altering legacy film and book payloads", () => {
  for (const operation of ["refresh", "process", "refresh-process", "verify"]) assert.equal(parseSnapshotJobPayload({ mediaType: "series", provider: "tmdb", operation }).mediaType, "series");
  for (const value of [{ mediaType: "series", provider: "fantlab" }, { mediaType: "series", entityType: "creator" }, { mediaType: "book", provider: "tmdb" }, { mediaType: "anime" }]) assert.throws(() => parseSnapshotJobPayload({ operation: "refresh", ...value }));
  assert.equal(parseSnapshotJobPayload({ operation: "process", provider: "tmdb" }).mediaType, undefined);
});
