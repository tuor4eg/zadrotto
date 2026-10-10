import { createHash, randomUUID } from "node:crypto";
import { setTimeout as delay } from "node:timers/promises";
import { getRedisClient } from "@/lib/services/redis";

export type BggRedis = Pick<NonNullable<Awaited<ReturnType<typeof getRedisClient>>>, "get" | "set" | "eval">;
export type BggRuntimeDependencies = { redis?: () => Promise<BggRedis | null> };

export class BggRequestError extends Error {
  constructor(
    readonly code: "provider-unavailable" | "provider-rate-limit" | "rate-limit-unavailable",
    readonly status: number | null = null,
    readonly retryAfterSeconds = 60,
    readonly invalidCredentials = false,
  ) {
    super(status ? `BGG request failed with HTTP ${status}.` : "BGG request unavailable.");
  }
}

const RELEASE_LOCK = `if redis.call('GET', KEYS[1]) == ARGV[1] then return redis.call('DEL', KEYS[1]) end return 0`;
const REQUEST_SLOT = `local ttl = redis.call('PTTL', KEYS[1]); if ttl > 0 then return ttl end redis.call('SET', KEYS[1], '1', 'PX', 5000); return 0`;
const COOLDOWN = `local ttl = redis.call('PTTL', KEYS[1]); if ttl < tonumber(ARGV[1]) then redis.call('SET', KEYS[1], '1', 'PX', ARGV[1]) end return 0`;

async function withSignal<T>(operation: Promise<T>, signal: AbortSignal): Promise<T> {
  if (signal.aborted) {
    void operation.catch(() => {});
    signal.throwIfAborted();
  }
  let onAbort: () => void = () => {};
  const aborted = new Promise<never>((_, reject) => {
    onAbort = () => reject(signal.reason);
    signal.addEventListener("abort", onAbort, { once: true });
  });
  try { return await Promise.race([operation, aborted]); }
  finally { signal.removeEventListener("abort", onAbort); }
}

export function createBggRuntime(dependencies: BggRuntimeDependencies = {}) {
  const pending = new Map<string, Promise<unknown>>();
  const redis = dependencies.redis ?? getRedisClient;
  async function client(signal: AbortSignal) {
    signal.throwIfAborted();
    const value = await withSignal(redis(), signal);
    signal.throwIfAborted();
    if (!value) throw new BggRequestError("rate-limit-unavailable");
    return value;
  }
  return {
    async cached<T>(token: string, key: string, ttl: number | ((value: T) => number), signal: AbortSignal, load: () => Promise<T>): Promise<T> {
      const scope = createHash("sha256").update(token).digest("hex");
      const cacheKey = `bgg:v2:${scope}:${key}`;
      const existing = pending.get(cacheKey);
      if (existing) return withSignal(existing as Promise<T>, signal);
      const operation = (async () => {
        const store = await client(signal);
        const lockKey = `${cacheKey}:lock`;
        const owner = randomUUID();
        while (true) {
          signal.throwIfAborted();
          const cached = await withSignal(store.get(cacheKey), signal);
          if (cached !== null) return JSON.parse(cached) as T;
          if (await withSignal(store.set(lockKey, owner, { NX: true, PX: 125_000 }), signal)) break;
          await delay(100, undefined, { signal });
        }
        try {
          const cached = await withSignal(store.get(cacheKey), signal);
          if (cached !== null) return JSON.parse(cached) as T;
          const value = await load();
          await withSignal(store.set(cacheKey, JSON.stringify(value), { EX: typeof ttl === "function" ? ttl(value) : ttl }), signal);
          return value;
        } finally {
          // The lease expires even when Redis is offline or the request deadline elapsed.
          await withSignal(store.eval(RELEASE_LOCK, { keys: [lockKey], arguments: [owner] }), AbortSignal.timeout(1_000)).catch(() => {});
        }
      })();
      pending.set(cacheKey, operation);
      try { return await withSignal(operation, signal); }
      finally { pending.delete(cacheKey); }
    },
    async waitForRequest(signal: AbortSignal) {
      const store = await client(signal);
      while (true) {
        signal.throwIfAborted();
        const wait = Number(await withSignal(store.eval(REQUEST_SLOT, { keys: ["bgg:xml:request-slot"], arguments: [] }), signal));
        if (wait === 0) return;
        await delay(Math.min(wait, 5_000), undefined, { signal });
      }
    },
    async cooldown(seconds: number, signal: AbortSignal) {
      const store = await client(signal);
      await withSignal(store.eval(COOLDOWN, { keys: ["bgg:xml:request-slot"], arguments: [String(Math.min(86_400, Math.max(5, seconds)) * 1000)] }), signal);
    },
  };
}
