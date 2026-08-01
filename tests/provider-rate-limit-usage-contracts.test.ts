import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { describe, it } from "node:test";

import { getFixedWindowRateLimitUsageWithClient } from "@/lib/rate-limits/redis";

const redisRateLimitsSource = readFileSync(
  "src/lib/rate-limits/redis.ts",
  "utf8",
);
const coverRateLimitsSource = readFileSync(
  "src/lib/covers/rate-limits.ts",
  "utf8",
);
const providerLimitsPageSource = readFileSync(
  "src/app/admin/(protected)/tools/providers/limits/page.tsx",
  "utf8",
);
const providerLimitsFormSource = readFileSync(
  "src/app/admin/(protected)/tools/providers/provider-limits-form.tsx",
  "utf8",
);

describe("provider daily rate limit usage", () => {
  it("reads zero and the actual counter value without incrementing it", async () => {
    const requestedKeys: string[] = [];
    const input = {
      keyPrefix: "cover-search:provider",
      subject: "tmdb",
      window: "day" as const,
      limit: 1000,
      now: new Date("2026-07-31T12:00:00.000Z"),
    };

    const empty = await getFixedWindowRateLimitUsageWithClient(input, {
      async get(key: string) {
        requestedKeys.push(key);
        return null;
      },
    });
    const exceeded = await getFixedWindowRateLimitUsageWithClient(input, {
      async get(key: string) {
        requestedKeys.push(key);
        return "1004";
      },
    });

    assert.deepEqual(empty, { ok: true, used: 0 });
    assert.deepEqual(exceeded, { ok: true, used: 1004 });
    assert.equal(requestedKeys[0], requestedKeys[1]);
    assert.match(requestedKeys[0] ?? "", /^cover-search:provider:tmdb:day:/);
  });

  it("rejects an invalid stored counter", async () => {
    const result = await getFixedWindowRateLimitUsageWithClient(
      {
        keyPrefix: "cover-search:provider",
        subject: "tmdb",
        window: "day",
        limit: 1000,
      },
      { async get() { return "broken"; } },
    );

    assert.deepEqual(result, { ok: false, error: "unavailable" });
  });

  it("reads the current fixed-window counter without incrementing it", () => {
    assert.match(
      redisRateLimitsSource,
      /getFixedWindowRateLimitUsage[\s\S]*client\.get\(getFixedWindowRateLimitKey\(input\)\)/,
    );
    assert.match(
      redisRateLimitsSource,
      /rawCount === null \? 0 : Number\(rawCount\)/,
    );
  });

  it("reads each provider usage from the same daily provider window", () => {
    assert.match(
      coverRateLimitsSource,
      /getProviderCoverSearchRateLimitUsage[\s\S]*keyPrefix: "cover-search:provider"[\s\S]*subject: limit\.providerCode[\s\S]*window: "day"/,
    );
    assert.match(
      coverRateLimitsSource,
      /used: result\.ok \? result\.used : null/,
    );
  });

  it("loads usage on the limits page and renders explicit usage states", () => {
    assert.match(
      providerLimitsPageSource,
      /getProviderCoverSearchRateLimitUsage\([\s\S]*providerRateLimitUsage=\{providerRateLimitUsage\}/,
    );
    assert.match(providerLimitsFormSource, /Использовано сегодня:/);
    assert.match(providerLimitsFormSource, /Лимит исчерпан:/);
    assert.match(providerLimitsFormSource, /Использование недоступно/);
  });
});
