import assert from "node:assert/strict";
import { describe, it } from "node:test";

import {
  AUTHOR_LOGIN_TURNSTILE_THRESHOLD,
  AUTHOR_LOGIN_TURNSTILE_TTL_SECONDS,
  clearAuthorLoginChallengeWithClient,
  getAuthorLoginChallengeKey,
  getAuthorLoginChallengeStateWithClient,
  recordAuthorLoginFailureWithClient,
} from "@/lib/auth/login-turnstile-challenge-store";

describe("author login Turnstile challenge store", () => {
  it("does not require a challenge before three password failures", async () => {
    let failures = 0;
    const client = {
      async eval(_script: string, options: { keys: string[]; arguments: string[] }) {
        failures += 1;
        assert.equal(options.arguments[0], String(AUTHOR_LOGIN_TURNSTILE_TTL_SECONDS));
        return failures;
      },
    };

    const first = await recordAuthorLoginFailureWithClient(client, "challenge-key");
    const second = await recordAuthorLoginFailureWithClient(client, "challenge-key");
    const third = await recordAuthorLoginFailureWithClient(client, "challenge-key");

    assert.deepEqual(first, { ok: true, challengeRequired: false, failures: 1 });
    assert.deepEqual(second, { ok: true, challengeRequired: false, failures: 2 });
    assert.deepEqual(third, {
      ok: true,
      challengeRequired: true,
      failures: AUTHOR_LOGIN_TURNSTILE_THRESHOLD,
    });
  });

  it("sets a fixed TTL only when the counter is new or missing one", async () => {
    let script = "";
    await recordAuthorLoginFailureWithClient({
      async eval(nextScript: string) {
        script = nextScript;
        return 1;
      },
    }, "challenge-key");

    assert.match(script, /failures == 1 or ttl < 0/);
    assert.match(script, /EXPIRE/);
    assert.doesNotMatch(script, /failures > 1[\s\S]*EXPIRE/);
  });

  it("reads an absent counter as an inactive challenge and fails closed on bad data", async () => {
    assert.deepEqual(
      await getAuthorLoginChallengeStateWithClient({ get: async () => null }, "challenge-key"),
      { ok: true, challengeRequired: false, failures: 0 },
    );
    assert.deepEqual(
      await getAuthorLoginChallengeStateWithClient({ get: async () => "invalid" }, "challenge-key"),
      { ok: false, error: "unavailable" },
    );
  });

  it("clears challenge state and fails closed on an invalid Redis response", async () => {
    assert.deepEqual(
      await clearAuthorLoginChallengeWithClient({ del: async () => 1 }, "challenge-key"),
      { ok: true },
    );
    assert.deepEqual(
      await clearAuthorLoginChallengeWithClient({ del: async () => Number.NaN }, "challenge-key"),
      { ok: false, error: "unavailable" },
    );
  });

  it("isolates challenge keys by both client IP and normalized login", () => {
    const base = getAuthorLoginChallengeKey({
      ipAddress: "198.51.100.10",
      normalizedLogin: "author",
    });
    const anotherIp = getAuthorLoginChallengeKey({
      ipAddress: "198.51.100.11",
      normalizedLogin: "author",
    });
    const anotherLogin = getAuthorLoginChallengeKey({
      ipAddress: "198.51.100.10",
      normalizedLogin: "another-author",
    });

    assert.notEqual(base, anotherIp);
    assert.notEqual(base, anotherLogin);
    const hashedSubject = base.split(":").at(-1) ?? "";
    assert.doesNotMatch(hashedSubject, /author|198\.51\.100\.10/);
    assert.match(hashedSubject, /^[a-f0-9]{64}$/);
  });
});
