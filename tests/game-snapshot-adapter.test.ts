import assert from "node:assert/strict";
import { test } from "node:test";
import { describeGameSource, normalizeGameSnapshot } from "../src/lib/providers/game-adapter";
import { snapshotHash } from "../src/lib/providers/snapshot-values";

const rawg = () => ({ id: 42, name: "Game", genres: [{ id: 3, name: "RPG" }], platforms: [{ platform: { id: 4, name: "PC" } }], developers: [{ id: 7, name: "Same Studio" }], publishers: [{ id: 7, name: "Same Studio" }], future: { nested: [null, true, "kept"] } });
const normalize = (payload: unknown, providerCode = "rawg", externalId = "42") => normalizeGameSnapshot({ providerCode, externalId, payload });

test("game adapters preserve provider identity, company namespaces and the original raw", () => {
  const payload = rawg();
  const before = structuredClone(payload);
  const hash = snapshotHash(payload);
  const normalized = normalize(payload);
  assert.deepEqual(normalized.companyReferences.map(row => [row.externalId, row.roleCode]), [["developer:7", "developer"], ["publisher:7", "publisher"]]);
  assert.deepEqual(normalized.genreFacts, { genres: ["RPG"], genreReferences: [{ id: "3", name: "RPG" }] });
  assert.deepEqual(normalized.platformFacts, { platforms: ["PC"] });
  assert.deepEqual(normalized.facts, {}, "catalog names belong to normalized relations, not metadata facts");
  assert.deepEqual(payload, before);
  assert.equal(snapshotHash(payload), hash);
  assert.throws(() => normalize(payload, "rawg", "43"));
  assert.throws(() => normalize(payload, "igdb"));
  const igdb = normalize([{ id: 42, name: "Game", involved_companies: [{ developer: true, publisher: true, company: { id: 7, name: "Same Studio" } }] }], "igdb");
  assert.deepEqual(igdb.companyReferences.map(row => [row.externalId, row.roleCode]), [["company:7", "developer"], ["company:7", "publisher"]]);
});

test("complete empty game rosters are distinct from partial or malformed raw", () => {
  const empty = { id: 42, name: "Empty", genres: [], platforms: [], developers: [], publishers: [] };
  assert.deepEqual(normalize(empty).companyReferences, []);
  assert.deepEqual(normalize(empty).genreFacts, { genres: [] });
  assert.deepEqual(normalize(empty).platformFacts, { platforms: [] });
  // Expanded IGDB responses omit absent collection fields; RAWG sends explicit arrays.
  assert.deepEqual(normalize([{ id: 42, name: "Empty" }], "igdb").companyReferences, []);
  for (const key of ["genres", "platforms", "developers", "publishers"] as const) {
    const partial: Record<string, unknown> = { ...empty };
    delete partial[key];
    assert.throws(() => normalize(partial), /INCOMPLETE_PROVIDER_SNAPSHOTS/);
    assert.throws(() => normalize({ ...empty, [key]: null }), /INCOMPLETE_PROVIDER_SNAPSHOTS/);
  }
  for (const value of [[], [{ id: 42, name: "One" }, { id: 43, name: "Two" }], [{ id: 42, name: "Bad", involved_companies: [{ company: { id: 7, name: "Studio" }, developer: "yes" }] }]]) assert.throws(() => normalize(value, "igdb"));
  assert.throws(() => normalize({ ...empty, developers: [{ name: "No identity" }] }));
  assert.throws(() => normalize({ ...empty, platforms: [{ platform: null }] }));
});

test("game raw descriptors separate provider, method and requested field contract", () => {
  const igdb = describeGameSource("igdb", "42");
  const rawgDescriptor = describeGameSource("rawg", "42");
  assert.equal(igdb.resourceType, "game");
  assert.equal(igdb.apiMethod, "games.details");
  assert.equal(rawgDescriptor.apiMethod, "game.details");
  assert.notEqual(snapshotHash(igdb), snapshotHash(rawgDescriptor));
  assert.match(String(igdb.requestParams.fields), /involved_companies\.company\.id/);
  for (const id of ["0", "-1", "01", "slug", "9007199254740992"]) assert.throws(() => describeGameSource("rawg", id));
});
