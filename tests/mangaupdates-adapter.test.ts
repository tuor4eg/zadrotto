import { strict as assert } from "node:assert";
import { test } from "node:test";
import { describeMangaUpdatesSeries, mangaUpdatesCoverCandidates, normalizeMangaUpdatesSnapshot } from "../src/lib/providers/mangaupdates-adapter";

const snapshot = { providerCode: "mangaupdates", externalId: "12345678901", payload: {
  series_id: 12345678901, title: "Example", type: "Manhwa", url: "https://www.mangaupdates.com/series/example", description: "Description", year: "2020", status: "3 Volumes (Complete)", completed: true,
  associated: [{ title: "Other name" }, { title: "Other name" }], genres: [{ genre: "Action" }],
  authors: [{ author_id: 7, name: "Creator", type: "Author" }, { author_id: 7, name: "Creator", type: "Artist" }],
  publishers: [{ publisher_id: 9, publisher_name: "Publisher", type: "Original" }], image: { url: { original: "https://example.com/cover.jpg" } },
} };
test("MangaUpdates maps aliases, genres, distinct writer/artist roles and publisher identity", () => {
  const result = normalizeMangaUpdatesSnapshot(snapshot);
  assert.equal(result.externalId, "12345678901");
  assert.deepEqual(result.fields, { title: "Example", aliases: ["Other name"], releaseYear: 2020, description: "Description" });
  assert.deepEqual(result.facts, { genres: ["Action"], issueCount: 3, completed: true, status: "3 Volumes (Complete)" });
  assert.deepEqual(result.creators.map(({ externalId, roleCode }) => [externalId, roleCode]), [["person:7", "writer"], ["person:7", "artist"], ["publisher:9", "publisher"]]);
  assert.equal(result.coverUrl, "https://example.com/cover.jpg");
});
test("MangaUpdates rejects wrong resource identities, novels, incomplete or conflicting creator data", () => {
  assert.throws(() => normalizeMangaUpdatesSnapshot({ ...snapshot, externalId: "12" }), /INVALID_PROVIDER_SNAPSHOT_REFERENCES/);
  assert.throws(() => normalizeMangaUpdatesSnapshot({ ...snapshot, payload: { ...snapshot.payload, type: "Novel" } }), /UNSUPPORTED_PROVIDER_MEDIA_TYPE/);
  assert.throws(() => normalizeMangaUpdatesSnapshot({ ...snapshot, payload: { ...snapshot.payload, authors: null } }), /INCOMPLETE_PROVIDER_SNAPSHOTS/);
  assert.throws(() => normalizeMangaUpdatesSnapshot({ ...snapshot, payload: { ...snapshot.payload, authors: [...snapshot.payload.authors, { author_id: 7, name: "Different", type: "Artist" }] } }), /INCOMPLETE_PROVIDER_SNAPSHOTS/);
  assert.throws(() => describeMangaUpdatesSeries("1.5"), /INVALID_PROVIDER_SNAPSHOT_REFERENCES/);
  assert.throws(() => describeMangaUpdatesSeries("9007199254740992"), /INVALID_PROVIDER_SNAPSHOT_REFERENCES/);
});
test("MangaUpdates empty known collections remain complete and absent dates do not invent metadata", () => {
  const result = normalizeMangaUpdatesSnapshot({ ...snapshot, payload: { ...snapshot.payload, year: "N/A", authors: [], publishers: [], genres: [], associated: [] } });
  assert.deepEqual(result.creators, []);
  assert.equal("releaseYear" in result.fields, false);
});

test("MangaUpdates stores issue counts separately and trusts the completion flag", () => {
  const facts = (status: string) => normalizeMangaUpdatesSnapshot({ ...snapshot, payload: { ...snapshot.payload, status, completed: false } }).facts;
  assert.equal(facts("volumes 3").issueCount, 3);
  assert.equal(facts("4+ volumes").issueCount, 4);
  assert.equal("issueCount" in facts("volumes, chapter 5"), false);
  assert.equal(facts("7 Volumes (Complete)").completed, false);
});

test("MangaUpdates accepts historical publisher names sharing one identity, as in Slayers", () => {
  const result = normalizeMangaUpdatesSnapshot({ ...snapshot, payload: { ...snapshot.payload, publishers: [
    { publisher_id: 74035444770, publisher_name: "Kadokawa", type: "Original" },
    { publisher_id: 74035444770, publisher_name: "Kadokawa Shoten", type: "Original" },
  ] } });
  assert.deepEqual(result.creators.filter(creator => creator.roleCode === "publisher"), [
    { externalId: "publisher:74035444770", name: "Kadokawa", roleCode: "publisher", position: 0 },
  ]);
  assert.equal(result.coverUrl, "https://example.com/cover.jpg");
});

test("MangaUpdates accepts unlinked credits without inventing creator identities", () => {
  const result = normalizeMangaUpdatesSnapshot({ ...snapshot, payload: { ...snapshot.payload, authors: [
    ...snapshot.payload.authors,
    { author_id: null, name: "DISCIPLES (Redice Studio)", type: "Artist" },
  ] } });
  assert.equal(result.creators.filter(creator => creator.roleCode !== "publisher").length, 2);
  assert.equal(result.coverUrl, "https://example.com/cover.jpg");
  for (const author_id of [undefined, -1, "123"]) {
    assert.throws(() => normalizeMangaUpdatesSnapshot({ ...snapshot, payload: { ...snapshot.payload, authors: [{ author_id, name: "Invalid", type: "Artist" }] } }), /INCOMPLETE_PROVIDER_SNAPSHOTS/);
  }
});

test("MangaUpdates cover discovery requires identity and image, not complete metadata", () => {
  const payload = { series_id: 15180124327, title: "Solo Leveling", type: "Manhwa", image: { url: { original: "https://cdn.mangaupdates.com/image/i515366.jpg" } } };
  assert.equal(mangaUpdatesCoverCandidates(payload, "15180124327")[0]?.imageUrl, payload.image.url.original);
  assert.deepEqual(mangaUpdatesCoverCandidates({ ...payload, image: null }, "15180124327"), []);
  assert.deepEqual(mangaUpdatesCoverCandidates({ ...payload, type: "Novel" }, "15180124327"), []);
  assert.throws(() => mangaUpdatesCoverCandidates(payload, "123"), /INVALID_PROVIDER_SNAPSHOT_REFERENCES/);
});
