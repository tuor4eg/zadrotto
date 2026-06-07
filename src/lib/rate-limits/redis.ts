import type { RedisClientType } from "redis";

import { getRedisClient } from "@/lib/services/redis";

export type RateLimitWindow = "minute" | "hour" | "day";

export type RateLimitResult =
  | {
      ok: true;
      allowed: true;
      remaining: number;
      retryAfterSeconds: 0;
    }
  | {
      ok: true;
      allowed: false;
      remaining: 0;
      retryAfterSeconds: number;
    }
  | {
      ok: false;
      error: "unavailable";
    };

export type FixedWindowRateLimitInput = {
  keyPrefix: string;
  subject: string;
  window: RateLimitWindow;
  limit: number | null;
  now?: Date;
};

type RateLimitCounterClient = Pick<RedisClientType, "eval" | "expire" | "multi">;

const WINDOW_MS = {
  minute: 60 * 1000,
  hour: 60 * 60 * 1000,
  day: 24 * 60 * 60 * 1000,
} as const satisfies Record<RateLimitWindow, number>;

function getWindowStart(input: { now: Date; window: RateLimitWindow }) {
  const windowMs = WINDOW_MS[input.window];

  return Math.floor(input.now.getTime() / windowMs) * windowMs;
}

export function getFixedWindowRateLimitKey(input: FixedWindowRateLimitInput) {
  const now = input.now ?? new Date();
  const windowStart = getWindowStart({ now, window: input.window });

  return `${input.keyPrefix}:${input.subject}:${input.window}:${windowStart}`;
}

export function getFixedWindowRetryAfterSeconds(input: {
  now: Date;
  window: RateLimitWindow;
}) {
  const windowMs = WINDOW_MS[input.window];
  const windowStart = getWindowStart(input);
  const windowEnd = windowStart + windowMs;

  return Math.max(1, Math.ceil((windowEnd - input.now.getTime()) / 1000));
}

export async function checkFixedWindowRateLimitWithClient(
  input: FixedWindowRateLimitInput,
  client: Pick<RateLimitCounterClient, "expire" | "multi">,
): Promise<RateLimitResult> {
  if (input.limit === null) {
    return {
      ok: true,
      allowed: true,
      remaining: Number.MAX_SAFE_INTEGER,
      retryAfterSeconds: 0,
    };
  }

  const now = input.now ?? new Date();
  const retryAfterSeconds = getFixedWindowRetryAfterSeconds({
    now,
    window: input.window,
  });
  const key = getFixedWindowRateLimitKey({ ...input, now });
  const results = await client
    .multi()
    .incr(key)
    .ttl(key)
    .exec();
  const rawCount = Array.isArray(results) ? results[0] : null;
  const rawTtl = Array.isArray(results) ? results[1] : null;
  const count = typeof rawCount === "number" ? rawCount : Number(rawCount);
  const ttl = typeof rawTtl === "number" ? rawTtl : Number(rawTtl);

  if (!Number.isFinite(count)) {
    return { ok: false, error: "unavailable" };
  }

  if (Number.isFinite(ttl) && ttl < 0) {
    await client.expire(key, retryAfterSeconds);
  }

  if (count > input.limit) {
    return {
      ok: true,
      allowed: false,
      remaining: 0,
      retryAfterSeconds,
    };
  }

  return {
    ok: true,
    allowed: true,
    remaining: input.limit - count,
    retryAfterSeconds: 0,
  };
}

const MULTI_WINDOW_RATE_LIMIT_SCRIPT = `
for index = 1, #KEYS do
  local limit = tonumber(ARGV[(index - 1) * 2 + 1])
  local retryAfter = tonumber(ARGV[(index - 1) * 2 + 2])
  local current = tonumber(redis.call("GET", KEYS[index]) or "0")

  if current >= limit then
    return {0, 0, retryAfter}
  end
end

local minRemaining = 9223372036854775807

for index = 1, #KEYS do
  local limit = tonumber(ARGV[(index - 1) * 2 + 1])
  local retryAfter = tonumber(ARGV[(index - 1) * 2 + 2])
  local current = tonumber(redis.call("INCR", KEYS[index]))

  if redis.call("TTL", KEYS[index]) < 0 then
    redis.call("EXPIRE", KEYS[index], retryAfter)
  end

  local remaining = limit - current
  if remaining < minRemaining then
    minRemaining = remaining
  end
end

return {1, minRemaining, 0}
`;

export async function checkFixedWindowRateLimits(
  inputs: readonly FixedWindowRateLimitInput[],
): Promise<RateLimitResult> {
  const limitedInputs = inputs.filter((input) => input.limit !== null);

  if (limitedInputs.length === 0) {
    return {
      ok: true,
      allowed: true,
      remaining: Number.MAX_SAFE_INTEGER,
      retryAfterSeconds: 0,
    };
  }

  const client = await getRedisClient();

  if (!client) {
    return { ok: false, error: "unavailable" };
  }

  try {
    const now = new Date();
    const keys = limitedInputs.map((input) =>
      getFixedWindowRateLimitKey({
        ...input,
        now,
      }),
    );
    const args = limitedInputs.flatMap((input) => [
      String(input.limit),
      String(getFixedWindowRetryAfterSeconds({ now, window: input.window })),
    ]);
    const rawResult = await client.eval(MULTI_WINDOW_RATE_LIMIT_SCRIPT, {
      keys,
      arguments: args,
    });
    const result = Array.isArray(rawResult) ? rawResult.map(Number) : [];
    const allowed = result[0] === 1;

    if (!result.length || result.some((value) => !Number.isFinite(value))) {
      return { ok: false, error: "unavailable" };
    }

    return allowed
      ? {
          ok: true,
          allowed: true,
          remaining: Math.max(0, result[1] ?? 0),
          retryAfterSeconds: 0,
        }
      : {
          ok: true,
          allowed: false,
          remaining: 0,
          retryAfterSeconds: Math.max(1, result[2] ?? 1),
        };
  } catch (error) {
    console.error(error);

    return { ok: false, error: "unavailable" };
  }
}

export async function checkFixedWindowRateLimit(
  input: FixedWindowRateLimitInput,
): Promise<RateLimitResult> {
  if (input.limit === null) {
    return {
      ok: true,
      allowed: true,
      remaining: Number.MAX_SAFE_INTEGER,
      retryAfterSeconds: 0,
    };
  }

  const client = await getRedisClient();

  if (!client) {
    return { ok: false, error: "unavailable" };
  }

  try {
    return await checkFixedWindowRateLimitWithClient(input, client as RateLimitCounterClient);
  } catch (error) {
    console.error(error);

    return { ok: false, error: "unavailable" };
  }
}
