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
  getRecentlyViewedIdsWithClient,
  getRecentlyViewedIdsSafely,
  getRecentlyViewedEntriesSafely,
  getRecentlyViewedEntriesWithClient,
  getRecentlyViewedKey,
  recordRecentlyViewedWithClient,
  removeRecentlyViewedIdsWithClient,
  type RecentlyViewedRedisClient,
} from "@/lib/main-page/recently-viewed";

function createModelRedis() {
  const entries = new Map<string, number>();
  const expiries: number[] = [];
  const client = {
    eval: async (_script: string, options: { arguments: string[] }) => {
      const [score, member, limit, ttlSeconds] = options.arguments.map(Number);
      entries.set(String(member), score);
      const ascending = [...entries.entries()].sort(
        ([leftMember, leftScore], [rightMember, rightScore]) =>
          leftScore - rightScore || leftMember.localeCompare(rightMember),
      );
      while (ascending.length > limit) {
        const [removedMember] = ascending.shift()!;
        entries.delete(removedMember);
      }
      expiries.push(ttlSeconds);
      return 1;
    },
    zRange: async (_key: string, start: number, stop: number, options?: { REV?: boolean }) => {
      const ordered = [...entries.entries()]
        .sort(([leftMember, leftScore], [rightMember, rightScore]) =>
          leftScore - rightScore || leftMember.localeCompare(rightMember),
        )
        .map(([member]) => member);
      if (options?.REV) ordered.reverse();
      return ordered.slice(start, stop + 1);
    },
    zRem: async (_key: string, members: string[]) => {
      let removed = 0;
      for (const member of members) removed += Number(entries.delete(member));
      return removed;
    },
  } as unknown as RecentlyViewedRedisClient;

  return { client, entries, expiries };
}

describe("recently viewed history", () => {
  it("parses configured limits", () => {
    assert.equal(DEFAULT_RECENTLY_VIEWED_HISTORY_LIMIT, 50);
    assert.equal(DEFAULT_RECENTLY_VIEWED_TTL_DAYS, 90);
    assert.equal(parseRecentlyViewedHistoryLimit("1"), 1);
    assert.equal(parseRecentlyViewedHistoryLimit(500), 500);
    assert.equal(parseRecentlyViewedHistoryLimit(0), null);
    assert.equal(parseRecentlyViewedTtlDays(365), 365);
    assert.equal(parseRecentlyViewedTtlDays(""), null);
    assert.equal(parseRecentlyViewedTtlDays(366), null);
    assert.equal(parseRecentlyViewedHistoryLimit(null), null);
    assert.equal(parseRecentlyViewedHistoryLimit(false), null);
    assert.equal(parseRecentlyViewedTtlDays(true), null);
  });

  it("atomically records, trims and expires a per-author ZSET", async () => {
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

  it("updates repeated members, preserves recency order and trims on the next view", async () => {
    const model = createModelRedis();

    for (let id = 1; id <= 51; id += 1) {
      await recordRecentlyViewedWithClient(model.client, {
        authorId: 7,
        historyLimit: 50,
        mediaItemId: id,
        now: 1_000 + id,
        ttlDays: 90,
      });
    }

    assert.equal(model.entries.size, 50);
    assert.equal(model.entries.has("1"), false);
    await recordRecentlyViewedWithClient(model.client, {
      authorId: 7,
      historyLimit: 50,
      mediaItemId: 2,
      now: 2_000,
      ttlDays: 30,
    });

    assert.equal(model.entries.size, 50);
    assert.deepEqual(
      await getRecentlyViewedIdsWithClient(model.client, 7, 3),
      [2, 51, 50],
    );
    assert.equal(model.expiries.length, 52);
    assert.equal(model.expiries.at(-2), 90 * 86_400);
    assert.equal(model.expiries.at(-1), 30 * 86_400);
  });

  it("reads newest-first and ignores invalid Redis members", async () => {
    let receivedOptions: { REV?: boolean } | undefined;
    const client = {
      zRange: async (_key: string, _start: number, _stop: number, options?: { REV?: boolean }) => {
        receivedOptions = options;
        return ["9", "bad", "0", "3.5", "7"];
      },
    } as unknown as RecentlyViewedRedisClient;

    assert.deepEqual(await getRecentlyViewedIdsWithClient(client, 3, 5), [9, 7]);
    assert.deepEqual(receivedOptions, { REV: true });
  });

  it("maps a Redis read failure to an empty history", async () => {
    const client = {
      zRange: async () => {
        throw new Error("Redis unavailable");
      },
    } as unknown as RecentlyViewedRedisClient;
    const originalConsoleError = console.error;
    console.error = () => undefined;

    try {
      assert.deepEqual(await getRecentlyViewedIdsSafely(client, 3, 5), []);
    } finally {
      console.error = originalConsoleError;
    }
  });

  it("reads valid score entries newest-first and rejects invalid IDs and dates", async () => {
    let options: { REV?: boolean } | undefined;
    const client = {
      zRangeWithScores: async (_key: string, _start: number, _stop: number, value?: { REV?: boolean }) => {
        options = value;
        return [
          { score: 1_786_000_000_123, value: "9" },
          { score: Number.POSITIVE_INFINITY, value: "8" },
          { score: 1_786_000_000_000, value: "bad" },
          { score: -1, value: "7" },
          { score: 1_785_000_000_000, value: "6" },
        ];
      },
    } as unknown as RecentlyViewedRedisClient;

    const result = await getRecentlyViewedEntriesWithClient(client, 3, 10);

    assert.equal(result.ok, true);
    assert.deepEqual(result.entries.map(({ mediaItemId }) => mediaItemId), [9, 6]);
    assert.equal(result.entries[0]?.viewedAt.toISOString(), "2026-08-06T07:06:40.123Z");
    assert.deepEqual(options, { REV: true });
  });

  it("distinguishes Redis score-read outage from an empty history", async () => {
    const client = {
      zRangeWithScores: async () => {
        throw new Error("Redis unavailable");
      },
    } as unknown as RecentlyViewedRedisClient;
    const originalConsoleError = console.error;
    console.error = () => undefined;

    try {
      assert.deepEqual(await getRecentlyViewedEntriesSafely(client, 3, 10), {
        entries: [],
        ok: false,
      });
      assert.deepEqual(await getRecentlyViewedEntriesSafely(null, 3, 10), {
        entries: [],
        ok: false,
      });
    } finally {
      console.error = originalConsoleError;
    }
  });

  it("cleanup skips empty input and removes members without touching expiry", async () => {
    const calls: string[][] = [];
    const client = {
      zRem: async (_key: string, members: string[]) => {
        calls.push(members);
        return members.length;
      },
    } as unknown as RecentlyViewedRedisClient;

    await removeRecentlyViewedIdsWithClient(client, 8, []);
    await removeRecentlyViewedIdsWithClient(client, 8, [4, 9]);

    assert.deepEqual(calls, [["4", "9"]]);
  });

  it("keeps recording on actual public mounts and revalidates on the server", () => {
    const marker = readFileSync("src/app/media/recently-viewed-marker.tsx", "utf8");
    const mediaPage = readFileSync("src/app/media/[code]/page.tsx", "utf8");
    const route = readFileSync("src/app/api/recently-viewed/route.ts", "utf8");

    assert.match(marker, /useEffect\([\s\S]*fetch\("\/api\/recently-viewed"/);
    assert.match(mediaPage, /currentAuthor \? <RecentlyViewedMarker/);
    assert.match(route, /getAccessibleMediaTypeCodes\(author\.id\)/);
    assert.match(route, /getMediaItemIdentityByCode\(code, accessibleMediaTypeCodes\)/);
    assert.match(route, /if \(!author\)/);
    assert.doesNotMatch(route, /getCurrentAdminUser/);
  });

  it("preserves Redis order, hides disabled types and cleans only invalid IDs", () => {
    const query = readFileSync("src/db/queries/main-page.ts", "utf8");
    const page = readFileSync("src/app/main/page.tsx", "utf8");
    const service = readFileSync("src/lib/main-page/recently-viewed.ts", "utf8");

    assert.match(query, /input\.ids\.flatMap/);
    assert.match(query, /slice\(0, 500\)/);
    assert.match(page, /validIds[\s\S]*removeRecentlyViewedIds/);
    assert.match(page, /filter\(\(item\) => enabledMediaTypeCodes\.includes\(item\.mediaType\)\)/);
    assert.match(service, /zRem/);
  });

  it("stores settings in migration 0050 and general admin settings", () => {
    const migration = readFileSync("drizzle/0050_recently_viewed_settings.sql", "utf8");
    const schema = readFileSync("src/db/schema.ts", "utf8");
    const form = readFileSync(
      "src/app/admin/(protected)/settings/archive/archive-settings-form.tsx",
      "utf8",
    );

    assert.match(migration, /recently_viewed_history_limit[\s\S]*DEFAULT 50 NOT NULL/);
    assert.match(migration, /recently_viewed_ttl_days[\s\S]*DEFAULT 90 NOT NULL/);
    assert.match(schema, /recentlyViewedHistoryLimit[\s\S]*between 1 and 500/);
    assert.match(schema, /recentlyViewedTtlDays[\s\S]*between 1 and 365/);
    assert.match(form, /Размер истории просмотров/);
    assert.match(form, /Срок хранения истории, дней/);
  });
});
