import assert from "node:assert/strict";
import { test } from "node:test";
import { extractTmdbDirectorReferences, isTmdbPersonId } from "../src/lib/creators/tmdb-directors";
const snapshot = (crew: unknown) => ({ providerCode: "tmdb", externalId: "42", payload: { id: 42, credits: { crew } } } as Parameters<typeof extractTmdbDirectorReferences>[0]);
test("directors preserve first position and deduplicate IDs, not names", () => {
  const refs = extractTmdbDirectorReferences(snapshot([{ id: 1, name: "Same", job: "Director" }, { id: 2, name: "Ignored", job: "Writer" }, { id: 1, name: "Same", job: "Director" }, { id: 3, name: "Same", job: "Director" }]));
  assert.deepEqual(refs.map(row => [row.externalId, row.sourcePosition]), [["person:1", 0], ["person:3", 3]]);
  assert.equal(refs[0].sourceUrl, "https://www.themoviedb.org/person/1");
  assert.deepEqual(extractTmdbDirectorReferences(snapshot([])), []);
  assert.deepEqual(extractTmdbDirectorReferences(snapshot([{ id: 2, name: "Writer", job: "Writer" }])), []);
});
test("missing, corrupt, contradictory or foreign evidence never means empty", () => {
  for (const crew of [undefined, null, {}, [null], ["bad"], [{}], [{ job: "Writer" }], [{ id: 0, name: "A", job: "Director" }], [{ id: 1, name: " ", job: "Director" }], [{ id: 1, name: "A", job: "Director" }, { id: 1, name: "B", job: "Director" }]]) assert.throws(() => extractTmdbDirectorReferences(snapshot(crew)));
  assert.throws(() => extractTmdbDirectorReferences({ ...snapshot([]), providerCode: "other" }));
  assert.throws(() => extractTmdbDirectorReferences({ ...snapshot([]), externalId: "43" }));
  assert.ok(isTmdbPersonId("person:42"));
  for (const id of ["company:42", "person:0", "person:01", "person:9007199254740992", 42]) assert.equal(isTmdbPersonId(id), false);
});
