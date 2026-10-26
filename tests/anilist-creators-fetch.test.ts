import assert from "node:assert/strict";
import { test } from "node:test";
import { fetchAniListCreatorPayload } from "../src/lib/providers/anilist-creators-fetch";
import { extractAniListCreatorReferences } from "../src/lib/providers/anilist-creators-adapter";
import type { fetchAniList } from "../src/lib/covers/anilist-request";
import type { JSONValue } from "../src/lib/providers/types";

const options = { candidateLimit: 5, tmdbResultScanLimit: 5 };
const request: typeof fetchAniList = async (url, init, options) => {
  await options?.beforeRequest?.();
  return fetch(url, init);
};
const staff = (id: number, role = "Director") => ({ role, node: { id, name: { full: `Person ${id}` } } });
const response = (page: number, edges: ReturnType<typeof staff>[], hasNextPage = false) => ({ data: { Media: {
  id: 100, idMal: 200, staff: { pageInfo: { currentPage: page, hasNextPage }, edges },
  ...(page === 1 ? { studios: { pageInfo: { hasNextPage: false }, nodes: [
    { id: 1, name: "Studio", isAnimationStudio: true }, { id: 2, name: "Producer", isAnimationStudio: false },
  ] } } : {}),
} } });

test("AniList fetch reads every staff page, charges each request and selects exact Director", async t => {
  const requests: { query: string; variables: { page: number } }[] = [];
  let quota = 0;
  t.mock.method(globalThis, "fetch", async (_url, init: RequestInit) => {
    const request = JSON.parse(String(init.body));
    requests.push(request);
    return Response.json(request.variables.page === 1 ? response(1, [staff(1), staff(2, "Episode Director"), staff(3, "Chief Director")], true) : response(2, [staff(1), staff(4)]));
  });
  const payload = await fetchAniListCreatorPayload({ externalId: "100" }, { ...options, beforeProviderSearch: async () => { quota++; return true; } }, { request });
  assert.ok(payload);
  assert.equal(quota, 2);
  assert.deepEqual(requests.map(r => r.variables.page), [1, 2]);
  assert.deepEqual(extractAniListCreatorReferences(payload).map(r => [r.externalId, r.roleCode, r.sourcePosition]), [
    ["person:1", "director", 0], ["person:4", "director", 4], ["studio:1", "production_company", 0], ["studio:2", "producer", 1],
  ]);
  assert.equal(payload.responses.length, 2);
  assert.ok(!requests[0].query.includes("isMain:"));
});

test("AniList rejects partial GraphQL errors, missing pages and conflicting identities", async t => {
  for (const broken of [
    { ...response(1, []), errors: [{ message: "partial" }] },
    response(2, []),
    { data: { Media: { id: 100, idMal: 200 } } },
    response(1, [staff(1), { role: "Director", node: { id: 1, name: { full: "Other" } } }]),
  ]) {
    const mock = t.mock.method(globalThis, "fetch", async () => Response.json(broken));
    await assert.rejects(fetchAniListCreatorPayload({ externalId: "100" }, options, { request }));
    mock.mock.restore();
  }
});

test("AniList failure or quota stop on a later page never returns a partial roster", async t => {
  let requests = 0;
  t.mock.method(globalThis, "fetch", async () => { requests++; return Response.json(response(1, [staff(1)], true)); });
  let reservations = 0;
  await assert.rejects(fetchAniListCreatorPayload({ externalId: "100" }, { ...options, beforeProviderSearch: async () => ++reservations === 1 ? true : "provider-daily-limit" }, { request }), /provider-daily-limit/);
  assert.equal(requests, 1);
});

test("AniList exact MAL lookup verifies identity and distinguishes absence from an empty roster", async t => {
  const mock = t.mock.method(globalThis, "fetch", async (_url, init: RequestInit) => {
    assert.match(JSON.parse(String(init.body)).query, /idMal:\$id/);
    return Response.json({ data: { Media: null } });
  });
  assert.equal(await fetchAniListCreatorPayload({ externalId: "200", byMalId: true }, options, { request }), null);
  mock.mock.restore();
  const empty = response(1, []);
  empty.data.Media.studios!.nodes = [];
  t.mock.method(globalThis, "fetch", async () => Response.json(empty));
  const payload = await fetchAniListCreatorPayload({ externalId: "200", byMalId: true }, options, { request });
  assert.deepEqual(extractAniListCreatorReferences(payload), []);
  await assert.rejects(fetchAniListCreatorPayload({ externalId: "201", byMalId: true }, options, { request }));
});

test("a later-page 429 resumes only the missing page without returning or charging cached partial evidence", async t => {
  const pages = new Map<number, JSONValue>();
  const progress = { startedAt: new Date(1), read: (page: number) => pages.get(page) ?? null,
    write: async (page: number, raw: JSONValue) => { pages.set(page, raw); }, clear: async () => { pages.clear(); } };
  const calls: number[] = [];
  let quota = 0;
  let limited = true;
  t.mock.method(globalThis, "fetch", async (_url, init: RequestInit) => {
    const page = JSON.parse(String(init.body)).variables.page as number;
    calls.push(page);
    if (page === 2 && limited) return new Response(null, { status: 429, headers: { "retry-after": "54" } });
    return Response.json(response(page, [staff(page)], page < 3));
  });
  const input = { externalId: "100" };
  const config = { ...options, beforeProviderSearch: async () => { quota++; return true; } };
  await assert.rejects(fetchAniListCreatorPayload(input, config, { request, progress }), { status: 429, retryAfterSeconds: 54 });
  assert.deepEqual([...pages.keys()], [1]);
  limited = false;
  const payload = await fetchAniListCreatorPayload(input, config, { request, progress });
  assert.deepEqual(calls, [1, 2, 2, 3]);
  assert.equal(quota, 4);
  assert.deepEqual(payload?.staff.map(row => row.id), [1, 2, 3]);
  assert.equal(payload?.responses.length, 3);
});
