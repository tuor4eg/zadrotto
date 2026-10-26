import assert from "node:assert/strict";
import test from "node:test";
import { createClient } from "redis";
import { aniListRetryAfterSeconds, fetchAniList, AniListThrottleError, ANILIST_REQUEST_INTERVAL_MS } from "../src/lib/covers/anilist-request";

test("AniList retry delay honors both Retry-After and the upstream reset timestamp", () => {
  const now = 1_000_000;
  assert.equal(aniListRetryAfterSeconds(new Headers({ "retry-after": "54" }), now), 54);
  assert.equal(aniListRetryAfterSeconds(new Headers({ "retry-after": "54", "x-ratelimit-reset": "1060" }), now), 60);
  assert.equal(aniListRetryAfterSeconds(new Headers({ "retry-after": new Date(now + 30_000).toUTCString() }), now), 30);
  assert.equal(aniListRetryAfterSeconds(new Headers(), now), 60);
});

const redisUrl = process.env.ANILIST_BACKFILL_TEST_REDIS_URL;
test("AniList spaces concurrent clients, shares cooldowns and resumes fenced page evidence", { skip: !redisUrl }, async t => {
  process.env.REDIS_URL = redisUrl;
  const first = createClient({ url: redisUrl });
  const second = createClient({ url: redisUrl });
  await Promise.all([first.connect(), second.connect()]);
  const keys = ["anilist:api:request-slot:v1", "anilist:api:cooldown:v1"];
  const runId = Date.now();
  try {
    await first.del(keys);
    await t.test("simultaneous app/worker requests start at the shared interval", async () => {
      const starts: number[] = [];
      let charged = 0;
      const fetchImpl: typeof fetch = async () => { starts.push(Date.now()); return Response.json({ ok: true }); };
      await Promise.all([first, second, first].map(redis => fetchAniList("https://graphql.anilist.co", {}, {
        redis: redis as never, fetchImpl, beforeRequest: async () => { charged++; },
      })));
      assert.equal(starts.length, 3);
      assert.equal(charged, 3);
      for (let i = 1; i < starts.length; i++) assert.ok(starts[i] - starts[i - 1] >= ANILIST_REQUEST_INTERVAL_MS - 50);
    });
    await t.test("429 defers other clients before quota or HTTP; cancellation never sends a request", async () => {
      await first.del(keys);
      let requests = 0;
      let charged = 0;
      const fetchImpl: typeof fetch = async () => { requests++; return new Response(null, { status: 429, headers: { "retry-after": "54" } }); };
      const response = await fetchAniList("https://graphql.anilist.co", {}, { redis: first as never, fetchImpl });
      assert.equal(response.status, 429);
      await assert.rejects(fetchAniList("https://graphql.anilist.co", {}, {
        redis: second as never, fetchImpl, beforeRequest: async () => { charged++; },
      }), error => error instanceof AniListThrottleError && error.retryAfterSeconds >= 54);
      assert.equal(requests, 1);
      assert.equal(charged, 0);
      const abort = new AbortController(); abort.abort();
      await assert.rejects(fetchAniList("https://graphql.anilist.co", { signal: abort.signal }, { redis: first as never, fetchImpl }));
      assert.equal(requests, 1);
    });
    await t.test("page progress survives a new lease, preserves original time and rejects stale writers", async () => {
      const { openAniListCreatorProgress } = await import("../src/lib/providers/anilist-creator-progress");
      const input = { runId, externalId: "100", byMalId: false, startedAt: new Date(1), lockToken: "old" };
      const old = await openAniListCreatorProgress(input);
      await old.write(1, { first: true });
      const resumed = await openAniListCreatorProgress({ ...input, lockToken: "new", startedAt: new Date(100) });
      assert.equal(resumed.startedAt.getTime(), 1);
      assert.deepEqual(resumed.read(1), { first: true });
      await assert.rejects(old.write(2, { stale: true }), /STALE_SNAPSHOT_JOB/);
      await old.clear();
      await resumed.write(2, { second: true });
      const reloaded = await openAniListCreatorProgress({ ...input, lockToken: "latest" });
      assert.deepEqual(reloaded.read(2), { second: true });
      const mal = await openAniListCreatorProgress({ ...input, byMalId: true });
      assert.equal(mal.read(1), null, "MAL and AniList identities have separate temporary evidence");
      await mal.clear();
      await reloaded.clear();
      assert.equal(await first.exists(`anilist:creators:pages:v1:${runId}:media:100`), 0);
    });
  } finally {
    await first.del(keys);
    const { closeRedisClient } = await import("../src/lib/services/redis");
    await closeRedisClient();
    await Promise.all([first.close(), second.close()]);
  }
});
