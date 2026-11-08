import type { RedisClientType } from "redis";

import { hashOpaqueToken } from "@/lib/auth/opaque-token";
import type { AuthRateLimitCheckResult } from "@/lib/auth/rate-limits";
import { getRedisClient } from "@/lib/services/redis";

// Use Redis time and one script so concurrent requests cannot bypass the cooldown.
// Rejected requests neither extend the pause nor advance its level.
export const FORGOT_PASSWORD_COOLDOWN_SCRIPT = `
local time = redis.call("TIME")
local now = tonumber(time[1])
local nextAt = tonumber(redis.call("HGET", KEYS[1], "nextAt") or "0")
local emailTtl = redis.call("TTL", KEYS[2])
local retryAfter = math.max(nextAt - now, emailTtl, 0)
if retryAfter > 0 then return retryAfter end

local count = tonumber(redis.call("HGET", KEYS[1], "count") or "0") + 1
local delays = {30, 60, 300, 900}
local delay = 0
if count >= 3 then delay = delays[math.min(count - 2, #delays)] end
redis.call("HSET", KEYS[1], "count", count, "nextAt", now + delay)
redis.call("EXPIRE", KEYS[1], 3600)
redis.call("SET", KEYS[2], "1", "EX", 60)
return 0
`;

export async function checkForgotPasswordCooldownWithClient(
  input: { ipAddress: string; normalizedEmail: string },
  client: Pick<RedisClientType, "eval">,
): Promise<AuthRateLimitCheckResult> {
  try {
    const retryAfter = await client.eval(FORGOT_PASSWORD_COOLDOWN_SCRIPT, {
      keys: [
        `auth:author-forgot:cooldown:ip:${hashOpaqueToken(input.ipAddress)}`,
        `auth:author-forgot:cooldown:email:${hashOpaqueToken(input.normalizedEmail)}`,
      ],
      arguments: [],
    });
    if (typeof retryAfter !== "number" || !Number.isFinite(retryAfter) || retryAfter < 0) {
      return { ok: false, reason: "unavailable" };
    }
    return retryAfter > 0
      ? { ok: false, reason: "limited", retryAfterSeconds: Math.ceil(retryAfter) }
      : { ok: true };
  } catch {
    return { ok: false, reason: "unavailable" };
  }
}

export async function checkForgotPasswordCooldown(input: { ipAddress: string; normalizedEmail: string }) {
  const client = await getRedisClient();
  if (!client) return { ok: false, reason: "unavailable" } as const;
  return checkForgotPasswordCooldownWithClient(input, client);
}
