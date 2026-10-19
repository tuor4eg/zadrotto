import { randomUUID } from "node:crypto";
import { getRedisClient } from "@/lib/services/redis";
import { getFixedWindowRateLimitKey } from "@/lib/rate-limits/redis";

export class GameProviderDeferredError extends Error {
  constructor(readonly code: "provider-rate-limit" | "provider-daily-limit" | "rate-limit-unavailable", readonly retryAfterSeconds: number) {
    super(`Game provider request deferred: ${code}`);
  }
}

// Admission is atomic: rejected requests consume neither daily nor per-second quota.
const ADMIT = `
local cooldown = redis.call('PTTL', KEYS[4]); if cooldown > 0 then return {1,cooldown} end
redis.call('ZREMRANGEBYSCORE', KEYS[3], '-inf', ARGV[1])
if redis.call('ZCARD', KEYS[3]) >= tonumber(ARGV[5]) then return {1,1000} end
local daily = tonumber(redis.call('GET', KEYS[1]) or '0')
if tonumber(ARGV[3]) >= 0 and daily >= tonumber(ARGV[3]) then return {2,ARGV[7]} end
if tonumber(redis.call('GET', KEYS[2]) or '0') >= tonumber(ARGV[4]) then return {1,redis.call('PTTL',KEYS[2])} end
redis.call('INCR', KEYS[1]); redis.call('PEXPIRE', KEYS[1], ARGV[7])
redis.call('INCR', KEYS[2]); if redis.call('PTTL',KEYS[2]) < 0 then redis.call('PEXPIRE',KEYS[2],1000) end
redis.call('ZADD',KEYS[3],tonumber(ARGV[1])+tonumber(ARGV[6]),ARGV[2]); redis.call('PEXPIRE',KEYS[3],ARGV[6])
return {0,0}`;

type BudgetRedis = Pick<NonNullable<Awaited<ReturnType<typeof getRedisClient>>>, "eval" | "zRem">;
export type GameProviderBudgetDependencies = {
  redis?: () => Promise<BudgetRedis | null>;
  dailyLimit?: (provider: "igdb" | "rawg") => Promise<number | null>;
  fetch?: typeof fetch;
};

export function createGameProviderFetch(dependencies: GameProviderBudgetDependencies = {}) {
return async function fetchGameProvider(provider: "igdb" | "rawg", url: string | URL, init: RequestInit = {}, backfill = false) {
  init.signal?.throwIfAborted();
  const redis = await (dependencies.redis ?? getRedisClient)().catch(() => null);
  if (!redis) throw new GameProviderDeferredError("rate-limit-unavailable", 60);
  const now = Date.now();
  const dayMs = 86_400_000;
  const remaining = dayMs - now % dayMs;
  let limit: number | null;
  try { limit = dependencies.dailyLimit ? await dependencies.dailyLimit(provider) : (await (await import("@/db/queries/cover-settings")).getCoverProviderRateLimits()).find((item) => item.providerCode === provider)?.searchesPerDay ?? null; }
  catch { throw new GameProviderDeferredError("rate-limit-unavailable", 60); }
  init.signal?.throwIfAborted();
  const prefix = `game-provider:${provider}`;
  const owner = randomUUID();
  const concurrencyKey = `${prefix}:active`;
  let result: number[];
  try {
    result = await redis.eval(ADMIT, {
      keys: [getFixedWindowRateLimitKey({keyPrefix:"cover-search:provider", subject:provider,window:"day",limit,now:new Date(now)}), `${prefix}:second`, concurrencyKey, `${prefix}:cooldown`],
      arguments: [String(now), owner, String(limit === null ? -1 : Math.max(0, limit - (backfill ? 100 : 0))), String(provider === "igdb" ? 3 : 1), String(provider === "igdb" ? 2 : 1), "120000", String(remaining)],
    }) as number[];
  } catch { throw new GameProviderDeferredError("rate-limit-unavailable", 60); }
  if (Number(result[0]) !== 0) throw new GameProviderDeferredError(Number(result[0]) === 2 ? "provider-daily-limit" : "provider-rate-limit", Math.max(1, Math.ceil(Number(result[1]) / 1000)));
  try {
    const response = await (dependencies.fetch ?? fetch)(url, {...init, signal:init.signal ?? AbortSignal.timeout(30000)});
    if (response.status === 429) {
      const header = response.headers.get("retry-after");
      const seconds = header && /^\d+(\.\d+)?$/.test(header) ? Number(header) : header ? Math.ceil((Date.parse(header)-Date.now())/1000) : 60;
      const retry = Number.isFinite(seconds) ? Math.max(1,seconds) : 60;
      await redis.eval(`local ttl=redis.call('PTTL',KEYS[1]); if ttl<tonumber(ARGV[1]) then redis.call('SET',KEYS[1],'1','PX',ARGV[1]) end return 0`,{keys:[`${prefix}:cooldown`],arguments:[String(retry*1000)]}).catch(()=>{});
      throw new GameProviderDeferredError("provider-rate-limit",retry);
    }
    // Hold the distributed slot until the complete response has been received.
    const body = await response.arrayBuffer();
    return new Response([204, 205, 304].includes(response.status) ? null : body, {status:response.status,statusText:response.statusText,headers:response.headers});
  } finally { await redis.zRem(concurrencyKey,owner).catch(()=>{}); }
}

}
export const fetchGameProvider = createGameProviderFetch();
