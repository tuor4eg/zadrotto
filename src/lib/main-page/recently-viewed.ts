import type { RedisClientType } from "redis";

import { getRedisClient } from "@/lib/services/redis";

export type RecentlyViewedRedisClient = Pick<
  RedisClientType,
  "eval" | "zRange" | "zRangeWithScores" | "zRem"
>;

export type RecentlyViewedEntriesResult = {
  entries: Array<{ mediaItemId: number; viewedAt: Date }>;
  ok: boolean;
};

export function getRecentlyViewedKey(authorId: number) {
  return `recently-viewed:${authorId}`;
}

export async function recordRecentlyViewedWithClient(
  client: RecentlyViewedRedisClient,
  input: {
    authorId: number;
    historyLimit: number;
    mediaItemId: number;
    now: number;
    ttlDays: number;
  },
) {
  await client.eval(
    `redis.call("ZADD", KEYS[1], ARGV[1], ARGV[2])
    redis.call("ZREMRANGEBYRANK", KEYS[1], 0, -(tonumber(ARGV[3]) + 1))
    redis.call("EXPIRE", KEYS[1], tonumber(ARGV[4]))
    return 1`,
    {
      arguments: [
        String(input.now),
        String(input.mediaItemId),
        String(input.historyLimit),
        String(input.ttlDays * 86_400),
      ],
      keys: [getRecentlyViewedKey(input.authorId)],
    },
  );
}

export async function recordRecentlyViewed(input: {
  authorId: number;
  historyLimit: number;
  mediaItemId: number;
  now?: number;
  ttlDays: number;
}) {
  try {
    const client = await getRedisClient();
    if (!client) return;

    await recordRecentlyViewedWithClient(client, {
      ...input,
      now: input.now ?? Date.now(),
    });
  } catch (error) {
    console.error("Recently viewed write error", error);
  }
}

export async function getRecentlyViewedIdsWithClient(
  client: RecentlyViewedRedisClient,
  authorId: number,
  limit: number,
) {
  const values = await client.zRange(getRecentlyViewedKey(authorId), 0, limit - 1, {
    REV: true,
  });

  return values.flatMap((value) => {
    const id = Number(value);
    return Number.isInteger(id) && id > 0 ? [id] : [];
  });
}

export async function getRecentlyViewedIdsSafely(
  client: RecentlyViewedRedisClient | null,
  authorId: number,
  limit: number,
) {
  if (!client) return [];

  try {
    return await getRecentlyViewedIdsWithClient(client, authorId, limit);
  } catch (error) {
    console.error("Recently viewed read error", error);
    return [];
  }
}

export async function getRecentlyViewedEntriesWithClient(
  client: RecentlyViewedRedisClient,
  authorId: number,
  limit: number,
): Promise<RecentlyViewedEntriesResult> {
  const values = await client.zRangeWithScores(
    getRecentlyViewedKey(authorId),
    0,
    limit - 1,
    { REV: true },
  );
  const entries = values.flatMap(({ score, value }) => {
    const mediaItemId = Number(value);
    const viewedAt = new Date(score);

    return Number.isInteger(mediaItemId)
      && mediaItemId > 0
      && Number.isFinite(score)
      && score > 0
      && !Number.isNaN(viewedAt.getTime())
      ? [{ mediaItemId, viewedAt }]
      : [];
  });

  return { entries, ok: true };
}

export async function getRecentlyViewedEntriesSafely(
  client: RecentlyViewedRedisClient | null,
  authorId: number,
  limit: number,
): Promise<RecentlyViewedEntriesResult> {
  if (!client) return { entries: [], ok: false };

  try {
    return await getRecentlyViewedEntriesWithClient(client, authorId, limit);
  } catch (error) {
    console.error("Recently viewed score read error", error);
    return { entries: [], ok: false };
  }
}

export async function getRecentlyViewedEntries(authorId: number, limit: number) {
  try {
    const client = await getRedisClient();
    return await getRecentlyViewedEntriesSafely(client, authorId, limit);
  } catch (error) {
    console.error("Recently viewed score read error", error);
    return { entries: [], ok: false } satisfies RecentlyViewedEntriesResult;
  }
}

export async function getRecentlyViewedIds(authorId: number, limit: number) {
  try {
    const client = await getRedisClient();
    return getRecentlyViewedIdsSafely(client, authorId, limit);
  } catch (error) {
    console.error("Recently viewed read error", error);
    return [];
  }
}

export async function removeRecentlyViewedIdsWithClient(
  client: RecentlyViewedRedisClient,
  authorId: number,
  ids: readonly number[],
) {
  if (ids.length === 0) return;
  await client.zRem(getRecentlyViewedKey(authorId), ids.map(String));
}

export async function removeRecentlyViewedIds(authorId: number, ids: readonly number[]) {
  if (ids.length === 0) return;

  try {
    const client = await getRedisClient();
    if (!client) return;
    await removeRecentlyViewedIdsWithClient(client, authorId, ids);
  } catch (error) {
    console.error("Recently viewed cleanup error", error);
  }
}
