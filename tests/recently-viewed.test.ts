import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { describe, it } from "node:test";

import {
  DEFAULT_RECENTLY_VIEWED_HISTORY_LIMIT,
  DEFAULT_RECENTLY_VIEWED_TTL_DAYS,
  parseRecentlyViewedHistoryLimit,
  parseRecentlyViewedTtlDays,
} from "@/lib/main-page/recently-viewed-settings";
import {
  getRecentlyViewedKey,
  recordRecentlyViewedWithClient,
  type RecentlyViewedRedisClient,
} from "@/lib/main-page/recently-viewed";

describe("recently viewed analytics", () => {
  it("keeps strict configured limits", () => {
    assert.equal(DEFAULT_RECENTLY_VIEWED_HISTORY_LIMIT, 50);
    assert.equal(DEFAULT_RECENTLY_VIEWED_TTL_DAYS, 90);
    assert.equal(parseRecentlyViewedHistoryLimit("1"), 1);
    assert.equal(parseRecentlyViewedHistoryLimit(500), 500);
    assert.equal(parseRecentlyViewedHistoryLimit(null), null);
    assert.equal(parseRecentlyViewedHistoryLimit(false), null);
    assert.equal(parseRecentlyViewedTtlDays(true), null);
    assert.equal(parseRecentlyViewedTtlDays(365), 365);
  });

  it("atomically records, trims and refreshes expiry", async () => {
    let script = "";
    let options: { arguments: string[]; keys: string[] } | null = null;
    const client = {
      eval: async (value: string, input: { arguments: string[]; keys: string[] }) => {
        script = value;
        options = input;
        return 1;
      },
    } as unknown as RecentlyViewedRedisClient;

    await recordRecentlyViewedWithClient(client, {
      authorId: 7,
      historyLimit: 50,
      mediaItemId: 42,
      now: 1_786_000_000_123,
      ttlDays: 90,
    });

    assert.equal(getRecentlyViewedKey(7), "recently-viewed:7");
    assert.match(script, /ZADD/);
    assert.match(script, /ZREMRANGEBYRANK/);
    assert.match(script, /EXPIRE/);
    assert.deepEqual(options, {
      arguments: ["1786000000123", "42", "50", String(90 * 86_400)],
      keys: ["recently-viewed:7"],
    });
  });

  it("keeps validated public mount tracking without exposing history UI", () => {
    const marker = readFileSync("src/app/media/recently-viewed-marker.tsx", "utf8");
    const mediaPage = readFileSync("src/app/media/[code]/page.tsx", "utf8");
    const route = readFileSync("src/app/api/recently-viewed/route.ts", "utf8");
    const service = readFileSync("src/lib/main-page/recently-viewed.ts", "utf8");

    assert.match(marker, /useEffect\([\s\S]*fetch\("\/api\/recently-viewed"/);
    assert.match(mediaPage, /currentAuthor \? <RecentlyViewedMarker/);
    assert.match(route, /getAccessibleMediaTypeCodes\(author\.id\)/);
    assert.match(route, /getMediaItemIdentityByCode\(code, accessibleMediaTypeCodes\)/);
    assert.doesNotMatch(service, /zRange|zRem|RecentlyViewedEntries/);
  });
});
