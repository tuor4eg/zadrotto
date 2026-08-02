import type { RedisClientType } from "redis";

import { getRedisClient } from "@/lib/services/redis";

export type RecentlyViewedRedisClient = Pick<RedisClientType, "eval">;

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
