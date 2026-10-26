import { setTimeout as delay } from "node:timers/promises";
import { getRedisClient } from "@/lib/services/redis";
import { getActiveProviderRequestTimeoutMs, ProviderHttpError, withProviderTimeout } from "./providers/shared";

// Shared by app and workers. AniList currently documents a degraded 30 requests/minute limit.
export const ANILIST_REQUEST_INTERVAL_MS = 2100;
const SLOT_KEY = "anilist:api:request-slot:v1";
const COOLDOWN_KEY = "anilist:api:cooldown:v1";
const ACQUIRE = `
local cooldown = redis.call('PTTL', KEYS[2])
if cooldown > 0 then return {0, cooldown} end
local wait = redis.call('PTTL', KEYS[1])
if wait > 0 then return {1, wait} end
redis.call('SET', KEYS[1], '1', 'PX', ARGV[1])
return {2, 0}`;
const COOLDOWN = `
local ttl = redis.call('PTTL', KEYS[1])
if ttl < tonumber(ARGV[1]) then redis.call('SET', KEYS[1], '1', 'PX', ARGV[1]) end
return 1`;
type Redis = NonNullable<Awaited<ReturnType<typeof getRedisClient>>>;

export class AniListThrottleError extends ProviderHttpError {
  constructor(readonly retryAfterSeconds: number) { super(429, null); }
}

export function aniListRetryAfterSeconds(headers: Headers, now = Date.now()) {
  const raw = headers.get("retry-after");
  const seconds = raw?.trim() ? Number(raw) : NaN;
  const retryAt = raw && !Number.isFinite(seconds) ? Date.parse(raw) : NaN;
  const resetAt = Number(headers.get("x-ratelimit-reset")) * 1000;
  const wait = Math.max(Number.isFinite(seconds) ? seconds : 0,
    Number.isFinite(retryAt) ? (retryAt - now) / 1000 : 0,
    Number.isFinite(resetAt) ? (resetAt - now) / 1000 : 0);
  return Math.max(1, Math.ceil(wait > 0 ? wait : 60));
}

async function acquire(redis: Redis, signal: AbortSignal) {
  while (true) {
    signal.throwIfAborted();
    let result: unknown;
    try {
      result = await redis.eval(ACQUIRE, { keys: [SLOT_KEY, COOLDOWN_KEY], arguments: [String(ANILIST_REQUEST_INTERVAL_MS)] });
    } catch { throw new Error("rate-limit-unavailable"); }
    signal.throwIfAborted();
    if (!Array.isArray(result) || result.length !== 2 || !result.every(value => Number.isFinite(Number(value)))) throw new Error("rate-limit-unavailable");
    const [kind, wait] = result.map(Number);
    if (kind === 2) return;
    if (kind === 0) throw new AniListThrottleError(Math.max(1, Math.ceil(wait / 1000)));
    await delay(Math.max(1, Math.min(wait, ANILIST_REQUEST_INTERVAL_MS)), undefined, { signal });
  }
}

/** Reserve a slot before charging quota; keep HTTP timeouts separate from waiting for the slot. */
export async function fetchAniList(input: RequestInfo | URL, init: RequestInit = {}, options: {
  beforeRequest?: () => Promise<void>; fetchImpl?: typeof fetch; redis?: Redis;
} = {}) {
  const signal = init.signal ?? AbortSignal.timeout(120_000);
  const redis = options.redis ?? await getRedisClient();
  if (!redis) throw new Error("rate-limit-unavailable");
  await acquire(redis, signal);
  await options.beforeRequest?.();
  signal.throwIfAborted();
  const response = await (options.fetchImpl ?? fetch)(input, { ...init,
    signal: withProviderTimeout(getActiveProviderRequestTimeoutMs(), signal), redirect: "error" });
  if (response.status === 429 || (response.ok && response.headers.get("x-ratelimit-remaining") === "0")) {
    const cooldownMs = aniListRetryAfterSeconds(response.headers) * 1000 + 1000;
    try {
      await redis.eval(COOLDOWN, { keys: [COOLDOWN_KEY], arguments: [String(cooldownMs)] });
    } catch {
      await response.body?.cancel();
      throw new Error("rate-limit-unavailable");
    }
  }
  return response;
}
