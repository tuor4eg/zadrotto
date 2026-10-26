import assert from "node:assert/strict";
import test from "node:test";
import { snapshotProviderDeferral } from "../src/lib/providers/snapshot-item-errors";

test("snapshot deferrals distinguish the daily reserve, unavailable Redis and upstream HTTP 429", () => {
  const daily = snapshotProviderDeferral(new Error("provider-daily-limit"), 1763)!;
  assert.equal(daily.deferSeconds, 3600);
  assert.match(daily.message, /суточной квоты.*резерва/);
  const redis = snapshotProviderDeferral(new Error("rate-limit-unavailable"), 1763)!;
  assert.equal(redis.deferSeconds, 60);
  assert.match(redis.message, /Redis; запрос к API не отправлен/);
  const upstream = snapshotProviderDeferral({ status: 429, retryAfterSeconds: 54 }, 1763)!;
  assert.equal(upstream.deferSeconds, 54);
  assert.match(upstream.message, /HTTP 429/);
  for (const result of [daily, redis, upstream]) assert.match(result.message, /Запись №1763/);
});

test("unknown errors are not deferred and upstream diagnostics omit uncontrolled error details", () => {
  assert.equal(snapshotProviderDeferral(new Error("network error"), 1763), null);
  assert.equal(snapshotProviderDeferral({ status: 503, retryAfterSeconds: 60 }, 1763), null);
  for (const retryAfterSeconds of [undefined, NaN, -1, 0, Infinity]) {
    const error = Object.assign(new Error("secret response body"), { status: 429, retryAfterSeconds });
    const result = snapshotProviderDeferral(error, 1763)!;
    assert.equal(result.deferSeconds, 60);
    assert.doesNotMatch(result.message, /secret response body/);
  }
});
