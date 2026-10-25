import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { test } from "node:test";
import { isCreatorDate, parseCreatorDate, planCreatorLifeDates } from "../src/lib/creators/life-dates";
import { createFantlabAuthorClient, FantlabHttpError } from "../src/lib/creators/fantlab-api";
import { fantlabAuthorDescriptor, mapFantlabAuthorDates } from "../src/lib/providers/creator-adapters";
import { parseSnapshotJobPayload } from "../src/lib/providers/snapshot-job-payload";
import type { JSONValue } from "../src/lib/providers/types";

const empty = { typeCode: "person", isPseudonym: false, birthDate: null, deathDate: null };
const dates = { birthDate: "1900-01-01", deathDate: "1980-01-01" };

test("creator dates require full calendar dates and preserve precision without timezone conversion", () => {
  for (const value of ["0001-01-01", "2000-02-29", "2024-02-29", "1900-02-28", "9999-12-31"]) {
    assert.equal(isCreatorDate(value), true, value);
    assert.equal(parseCreatorDate(value), value);
  }
  for (const value of ["1900-02-29", "2023-02-29", "2020-04-31", "0000-01-01", "2000-00-01", "2000-01-00", "2000-13-01", "2000-1-01", "2000", "2000-01", "2000-01-01T00:00:00Z", " 2000-01-01", 20000101, {}, true]) {
    assert.equal(isCreatorDate(value), false, String(value));
    assert.throws(() => parseCreatorDate(value), /полную корректную дату/);
  }
  for (const value of [null, undefined, ""]) assert.equal(parseCreatorDate(value), null);
});

test("date application fills NULL only, respects pseudonyms and detects chronological conflicts", () => {
  assert.deepEqual(planCreatorLifeDates(empty, dates).changes, dates);
  assert.deepEqual(planCreatorLifeDates({ ...empty, birthDate: "1890-01-01" }, dates).changes, { deathDate: dates.deathDate });
  assert.deepEqual(planCreatorLifeDates({ ...empty, ...dates }, { birthDate: "1890-01-01", deathDate: "1990-01-01" }).changes, {});
  for (const typeCode of ["collective", "organization"]) {
    assert.deepEqual(planCreatorLifeDates({ ...empty, typeCode }, dates), { changes: {}, diagnostics: ["non-person-skipped"] });
  }
  assert.deepEqual(planCreatorLifeDates({ ...empty, isPseudonym: true }, dates), { changes: {}, diagnostics: ["pseudonym-skipped"] });
  for (const [current, candidate] of [
    [empty, { birthDate: "2000-01-01", deathDate: "1900-01-01" }],
    [{ ...empty, birthDate: "2000-01-01" }, dates],
    [{ ...empty, deathDate: "1800-01-01" }, dates],
  ] as const) {
    assert.deepEqual(planCreatorLifeDates(current, candidate), { changes: {}, diagnostics: ["life-dates-conflict"] });
  }
  assert.deepEqual(planCreatorLifeDates(empty, { birthDate: "2000-01-01", deathDate: "2000-01-01" }).diagnostics, []);
});

test("FantLab real author responses map only dates and retain their full JSON", async () => {
  for (const id of ["1", "2", "3"]) {
    const payload = JSON.parse(await readFile(`tests/fixtures/fantlab-authors/${id}.json`, "utf8"));
    const original = structuredClone(payload);
    const descriptor = fantlabAuthorDescriptor(id);
    assert.deepEqual(descriptor, { providerCode: "fantlab", resourceType: "author", externalId: id, apiMethod: "autor.get", requestParams: { biography: 1, awards: 1 } });
    const projection = mapFantlabAuthorDates({ ...descriptor, payload });
    assert.equal(projection.birthDate, payload.birthday);
    assert.equal(projection.deathDate, payload.deathday ?? null);
    assert.equal(typeof payload.biography, "string");
    assert.equal(typeof payload.awards, "object");
    assert.deepEqual(payload, original);
    assert.deepEqual(Object.keys(projection).sort(), ["birthDate", "deathDate", "diagnostics"]);
    const invalid = mapFantlabAuthorDates({ ...descriptor, payload: { ...payload, birthday: "1900-02-29", deathday: "1980-00-00" } });
    assert.deepEqual(invalid, { birthDate: null, deathDate: null, diagnostics: ["invalid-birthday", "invalid-deathday"] });
    for (const override of [{ providerCode: "other" }, { resourceType: "work" }, { apiMethod: "detail" }, { requestParams: {} }]) {
      assert.throws(() => mapFantlabAuthorDates({ ...descriptor, ...override, payload }), /INVALID_CREATOR_SNAPSHOT/);
    }
    for (const key of ["biography", "awards"]) {
      const incomplete = { ...payload }; delete incomplete[key];
      assert.throws(() => mapFantlabAuthorDates({ ...descriptor, payload: incomplete }), /INVALID_CREATOR_SNAPSHOT/);
    }
    assert.throws(() => mapFantlabAuthorDates({ ...descriptor, payload: { ...payload, autor_id: 999 } }));
  }
});

test("creator snapshot jobs accept three operations, preserve old book payloads and reject cross-entity inputs", () => {
  for (const operation of ["refresh", "process", "refresh-process"]) {
    const payload = { entityType: "creator", provider: "fantlab", creatorIds: [1, 2], operation, batchSize: 2, afterId: 0, throughId: 3 };
    assert.deepEqual(parseSnapshotJobPayload(payload), payload);
  }
  const old = { operation: "verify", provider: "google-books", mediaItemIds: [1] };
  assert.deepEqual(parseSnapshotJobPayload(old), old);
  const base = { entityType: "creator", provider: "fantlab", operation: "process" };
  for (const override of [{ operation: "verify" }, { provider: "open-library" }, { provider: undefined }, { mediaItemIds: [1] }, { creatorIds: [] }, { creatorIds: [0] }, { creatorIds: [1.5] }, { creatorIds: Array(201).fill(1) }]) {
    assert.throws(() => parseSnapshotJobPayload({ ...base, ...override }));
  }
  assert.throws(() => parseSnapshotJobPayload({ operation: "process", creatorIds: [1] }));
  for (const operation of ["refresh", "refresh-process"]) {
    const payload = { entityType: "creator", provider: "fantlab", operation, onlyMissingSnapshots: true };
    assert.deepEqual(parseSnapshotJobPayload(payload), payload);
    const mediaPayload = { provider: "fantlab", operation, onlyMissingSnapshots: true };
    assert.deepEqual(parseSnapshotJobPayload(mediaPayload), mediaPayload);
  }
  for (const payload of [
    { ...base, onlyMissingSnapshots: true },
    { ...base, operation: "refresh", onlyMissingSnapshots: "true" },
    { operation: "verify", provider: "fantlab", onlyMissingSnapshots: true },
  ]) assert.throws(() => parseSnapshotJobPayload(payload));
});

test("FantLab raw request preserves unknown fields, parameters and job-owned 429 retry", async () => {
  const payload = JSON.parse(await readFile("tests/fixtures/fantlab-authors/1.json", "utf8")) as Record<string, JSONValue>;
  payload.future = { nested: [null, true, 17] };
  let calls = 0;
  const events: string[] = [];
  const cooldowns: number[] = [];
  const client = createFantlabAuthorClient({
    acquire: async () => { events.push("acquire"); return async ms => { cooldowns.push(ms); }; },
    fetch: async input => {
      calls++; events.push("fetch");
      assert.equal(String(input), "https://api.fantlab.ru/autor/1?biography=1&awards=1");
      return calls === 1 ? Response.json(payload) : new Response(null, { status: 429, headers: { "retry-after": "120" } });
    },
  });
  assert.deepEqual(await client.authorRaw("1", undefined, async () => { events.push("timestamp"); }), payload);
  assert.deepEqual(events, ["acquire", "timestamp", "fetch"]);
  await assert.rejects(client.authorRaw("1"), error => error instanceof FantlabHttpError && error.status === 429 && error.retryAfterSeconds === 120);
  assert.equal(calls, 2, "authorRaw leaves retries to the job checkpoint");
  assert.deepEqual(cooldowns, [1000, 120000]);
});

test("FantLab HTTP 404 can contain a valid closed author; errors never impersonate one", async () => {
  const payload = JSON.parse(await readFile("tests/fixtures/fantlab-authors/10433-http404.json", "utf8"));
  let releases = 0;
  const client = (response: () => Response) => createFantlabAuthorClient({
    acquire: async () => async () => { releases++; }, fetch: async () => response(),
  });
  const raw = await client(() => Response.json(payload, { status: 404 })).authorRaw("10433");
  assert.deepEqual(raw, payload);
  assert.deepEqual(mapFantlabAuthorDates({ ...fantlabAuthorDescriptor("10433"), payload: raw }), {
    birthDate: "1935-09-17", deathDate: "2001-11-10", diagnostics: ["fantlab-profile-not-opened"],
  });
  for (const invalid of [{}, { error: "not found" }, { ...payload, autor_id: 1 }, { ...payload, id: 1 },
    { ...payload, type: "work" }, { ...payload, name: "" }, { ...payload, is_opened: null },
    { ...payload, biography: null }, { ...payload, awards: null }]) {
    await assert.rejects(client(() => Response.json(invalid, { status: 404 })).authorRaw("10433"), error => error instanceof FantlabHttpError && error.status === 404);
  }
  for (const response of [new Response(null, { status: 404 }), new Response("<html>Not found</html>", { status: 404 }), Response.json(payload, { status: 403 })]) {
    await assert.rejects(client(() => response).authorRaw("10433"), error => error instanceof FantlabHttpError && error.status === response.status);
  }
  await assert.rejects(client(() => Response.json(payload, { status: 404 })).author("10433"), error => error instanceof FantlabHttpError && error.status === 404);
  assert.equal(releases, 14, "every attempt releases the common rate limiter slot");
});

test("FantLab raw response rejects oversized bodies without truncation and respects cancellation", async () => {
  let releases = 0;
  const client = createFantlabAuthorClient({
    acquire: async () => async () => { releases++; },
    fetch: async () => new Response(" ".repeat(2 * 1024 * 1024 + 1)),
  });
  await assert.rejects(client.authorRaw("1"), /Слишком большой ответ/);
  assert.equal(releases, 1);
  const controller = new AbortController(); controller.abort();
  await assert.rejects(client.authorRaw("1", controller.signal), error => error instanceof Error && error.name === "AbortError");
  assert.equal(releases, 1, "aborted operation never acquires a request slot");
});

