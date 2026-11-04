import assert from "node:assert/strict";
import { test } from "node:test";
import { createClient } from "redis";
import { consumeExternalAttempt, externalAttemptKey, hashExternalAuthSecret, newExternalAuthSecret, saveExternalAttempt, EXTERNAL_AUTH_TTL_SECONDS } from "../src/lib/auth/external/attempts";
import type { ExternalAuthAttempt } from "../src/lib/auth/external/model";

test("attempts reject malformed secrets without accessing Redis", async () => {
  const client = { set: async () => { throw new Error("unexpected Redis set"); }, eval: async () => { throw new Error("unexpected Redis eval"); } };
  assert.equal(await consumeExternalAttempt(client, { state: "invalid", browser: newExternalAuthSecret(), provider: "example" }), null);
  assert.equal(await consumeExternalAttempt(client, { state: newExternalAuthSecret(), browser: "invalid", provider: "example" }), null);
});

test("Redis attempts bind browser/provider, expire, and are consumed atomically once", { skip: !process.env.EXTERNAL_AUTH_TEST_REDIS_URL }, async () => {
  const client = createClient({ url: process.env.EXTERNAL_AUTH_TEST_REDIS_URL });
  await client.connect();
  const browser = newExternalAuthSecret();
  const makeAttempt = (): ExternalAuthAttempt => ({ provider: "example", intent: "login", state: newExternalAuthSecret(), browserHash: hashExternalAuthSecret(browser), returnTo: "/author/profile", verifier: newExternalAuthSecret(), nonce: newExternalAuthSecret() });
  const attempts = [makeAttempt(), makeAttempt()];
  try {
    const [attempt, expiring] = attempts;
    await saveExternalAttempt(client, attempt);
    const ttl = await client.ttl(externalAttemptKey(attempt.state));
    assert.ok(ttl > 0 && ttl <= EXTERNAL_AUTH_TTL_SECONDS);
    await assert.rejects(saveExternalAttempt(client, attempt), /unavailable/);
    assert.equal(await consumeExternalAttempt(client, { state: attempt.state, browser: newExternalAuthSecret(), provider: attempt.provider }), null);
    assert.equal(await consumeExternalAttempt(client, { state: attempt.state, browser, provider: "different" }), null);
    const results = await Promise.all(Array.from({ length: 12 }, () => consumeExternalAttempt(client, { state: attempt.state, browser, provider: attempt.provider })));
    assert.deepEqual(results.filter(Boolean), [attempt]);
    assert.equal(await consumeExternalAttempt(client, { state: attempt.state, browser, provider: attempt.provider }), null);
    await saveExternalAttempt(client, expiring);
    await client.expire(externalAttemptKey(expiring.state), 0);
    assert.equal(await consumeExternalAttempt(client, { state: expiring.state, browser, provider: expiring.provider }), null);
    assert.equal(await consumeExternalAttempt(client, { state: newExternalAuthSecret(), browser, provider: attempt.provider }), null);
  } finally {
    for (const attempt of attempts) await client.del(externalAttemptKey(attempt.state));
    await client.quit();
  }
});
