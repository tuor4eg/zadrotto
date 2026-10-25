import assert from "node:assert/strict";
import { test } from "node:test";
import { creatorProfileDescriptor, creatorProfileTargetFromBinding, parseCreatorProfileTarget } from "../src/lib/providers/creator-profile-targets";
import { fetchCreatorProfileRaw } from "../src/lib/providers/creator-profile-fetch";

test("profile targets preserve namespaces and reject malformed external IDs", () => {
  for (const [provider, externalCreatorId, resourceType] of [["fantlab", "12", "author"], ["igdb", "company:12", "company"], ["tmdb", "company:12", "company"], ["rawg", "developer:12", "developer"], ["rawg", "publisher:12", "publisher"]]) {
    assert.deepEqual(creatorProfileTargetFromBinding({ provider, externalCreatorId }), { provider, resourceType, externalId: "12" });
  }
  for (const externalId of ["0", "-1", "01", "1;drop", "9007199254740992", "1:2"]) assert.throws(() => parseCreatorProfileTarget({ provider: "tmdb", resourceType: "company", externalId }));
  assert.equal(creatorProfileTargetFromBinding({ provider: "tmdb", externalCreatorId: "company:1:2" }), null);
  assert.notDeepEqual(creatorProfileDescriptor({ provider: "rawg", resourceType: "developer", externalId: "1" }), creatorProfileDescriptor({ provider: "rawg", resourceType: "publisher", externalId: "1" }));
});

test("full TMDB and RAWG profiles preserve unknown data without applying domain fields", async () => {
  for (const provider of ["tmdb", "rawg"] as const) {
    const raw = { id: 12, name: "Studio", unknown: { nested: [1, 2] }, logo_path: "/logo.png" };
    let requests = 0;
    const mocked: typeof fetch = async (input) => {
      requests++;
      assert.match(String(input), provider === "tmdb" ? /\/company\/12$/ : /\/publishers\/12\?key=/);
      return Response.json(raw);
    };
    const result = await fetchCreatorProfileRaw({ provider, resourceType: provider === "tmdb" ? "company" : "publisher", externalId: "12" }, {
      signal: new AbortController().signal, credentials: { tmdb: { accessToken: "test" }, rawg: { apiKey: "test" } }, requestStartedAt: async () => new Date(0), fetchImpl: mocked, gameFetch: async (_provider, url, init) => mocked(url, init),
    });
    assert.equal(requests, 1);
    assert.deepEqual(result.payload, raw);
    assert.deepEqual(result.requestStartedAt, new Date(0));
  }
});

test("IGDB requests wildcard profile and expanded logo and websites, preserving response row", async () => {
  const raw = { id: 12, name: "Studio", unknown: true, logo: { image_id: "logo", width: 123 }, websites: [{ url: "https://example.org", unknown: true }] };
  const result = await fetchCreatorProfileRaw({ provider: "igdb", resourceType: "company", externalId: "12" }, {
    signal: new AbortController().signal, credentials: { igdb: { clientId: "id", clientSecret: "secret" } }, requestStartedAt: async () => new Date(0), igdbToken: async () => "token",
    gameFetch: async (_provider, _url, init) => { assert.equal(init?.body, "fields *,logo.*,websites.*; where id = 12; limit 1;"); return Response.json([raw]); },
  });
  assert.deepEqual(result.payload, raw);
});

test("mismatching profile identity cannot be persisted", async () => {
  await assert.rejects(fetchCreatorProfileRaw({ provider: "tmdb", resourceType: "company", externalId: "12" }, {
    signal: new AbortController().signal, credentials: { tmdb: { accessToken: "test" } }, requestStartedAt: async () => new Date(0), fetchImpl: async () => Response.json({ id: 13, name: "Wrong" }),
  }), /INVALID_CREATOR_PROFILE_RESPONSE/);
});

test("raw jobs accept all Creator providers and preserve the missing-only binding checkpoint", async () => {
  const { parseSnapshotJobPayload } = await import("../src/lib/providers/snapshot-job-payload");
  for (const provider of [undefined, "fantlab", "tmdb", "igdb", "rawg"]) {
    const payload = { entityType: "creator", operation: "refresh", provider, onlyMissingSnapshots: true,
      profileCheckpoint: { afterBindingId: 17, throughBindingId: 99, nextTargetIndex: 0, processed: 3, failed: 0, errors: [] } };
    assert.deepEqual(parseSnapshotJobPayload(payload), payload);
  }
  assert.throws(() => parseSnapshotJobPayload({ entityType: "creator", operation: "refresh", profileTargets: [{ provider: "tmdb", resourceType: "company", externalId: "7" }] }));
  assert.throws(() => parseSnapshotJobPayload({ entityType: "creator", provider: "rawg", operation: "process" }));
});

test("TMDB person profiles use numeric person identity, Russian full raw and preserve unknown fields", async () => {
  const target = { provider: "tmdb", resourceType: "person", externalId: "17" } as const;
  assert.deepEqual(creatorProfileTargetFromBinding({ provider: "tmdb", externalCreatorId: "person:17" }), target);
  assert.deepEqual(creatorProfileDescriptor(target), { providerCode: "tmdb", resourceType: "person", externalId: "17", apiMethod: "person.details", requestParams: { language: "ru-RU" } });
  const payload = { id: 17, name: "Director", biography: "Raw", future: { nested: [1] } };
  const result = await fetchCreatorProfileRaw(target, { signal: new AbortController().signal, credentials: { tmdb: { accessToken: "test" } }, requestStartedAt: async () => new Date(0), fetchImpl: async url => {
    assert.equal(String(url), "https://api.themoviedb.org/3/person/17?language=ru-RU");
    return Response.json(payload);
  } });
  assert.deepEqual(result.payload, payload);
});

test("TMDB date mapper validates descriptor, identity and calendar dates", async () => {
  const { mapTmdbPersonDates } = await import("../src/lib/providers/creator-adapters");
  const descriptor = creatorProfileDescriptor({ provider: "tmdb", resourceType: "person", externalId: "17" });
  assert.deepEqual(mapTmdbPersonDates({ ...descriptor, payload: { id: 17, name: "Director", birthday: "1900-02-29", deathday: "2000-02-29" } }), { birthDate: null, deathDate: "2000-02-29", diagnostics: ["invalid-birthday"] });
  assert.throws(() => mapTmdbPersonDates({ ...descriptor, requestParams: {}, payload: { id: 17, name: "Director" } }), /INVALID_CREATOR_SNAPSHOT/);
  assert.throws(() => mapTmdbPersonDates({ ...descriptor, payload: { id: 18, name: "Director" } }), /INVALID_CREATOR_SNAPSHOT/);
});
