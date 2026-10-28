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


test("game transport quota errors defer snapshot work without consuming item retries", () => {
  for (const code of ["provider-daily-limit", "provider-rate-limit", "rate-limit-unavailable"]) {
    const error = Object.assign(new Error(`Game provider request deferred: ${code}`), {code, retryAfterSeconds: 17});
    const result = snapshotProviderDeferral(error, 42);
    assert.ok(result);
    assert.ok(result.deferSeconds >= 17);
    assert.match(result.message, /42/);
  }
});

test("BGG preparing status defers without consuming an item retry or exposing the response", () => {
  for (const retryAfterSeconds of [13.2, undefined, NaN, -1]) {
    const error = Object.assign(new Error("private upstream payload"), { status: 202, retryAfterSeconds });
    const result = snapshotProviderDeferral(error, 42)!;
    assert.equal(result.deferSeconds, retryAfterSeconds === 13.2 ? 14 : 60);
    assert.match(result.message, /BGG готовит.*Запись №42/);
    assert.doesNotMatch(result.message, /private upstream/);
  }
});
