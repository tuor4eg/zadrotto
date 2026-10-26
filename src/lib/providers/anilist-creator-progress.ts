import { getRedisClient } from "@/lib/services/redis";
import type { JSONValue } from "./types";

const TTL_SECONDS = 86400;
const WRITE = `
if redis.call('HGET', KEYS[1], 'owner') ~= ARGV[1] then return 0 end
redis.call('HSET', KEYS[1], ARGV[2], ARGV[3])
return 1`;
const CLEAR = `
if redis.call('HGET', KEYS[1], 'owner') == ARGV[1] then return redis.call('DEL', KEYS[1]) end
return 0`;
const OPEN = `
if redis.call('EXISTS', KEYS[1]) == 0 then
  redis.call('HSET', KEYS[1], 'startedAt', ARGV[2])
  redis.call('EXPIRE', KEYS[1], ARGV[3])
end
redis.call('HSET', KEYS[1], 'owner', ARGV[1])
return redis.call('HGETALL', KEYS[1])`;

export type AniListCreatorProgress = {
  startedAt: Date;
  read(page: number): JSONValue | null;
  write(page: number, payload: JSONValue): Promise<void>;
  clear(): Promise<void>;
};

/** Run-scoped incomplete evidence. It never creates snapshots, links, or working participation. */
export async function openAniListCreatorProgress(input: {
  runId: number; lockToken: string; externalId: string; byMalId: boolean; startedAt: Date;
}): Promise<AniListCreatorProgress> {
  const redis = await getRedisClient();
  if (!redis) throw new Error("rate-limit-unavailable");
  const key = `anilist:creators:pages:v1:${input.runId}:${input.byMalId ? "mal" : "media"}:${input.externalId}`;
  let raw: unknown;
  try {
    raw = await redis.eval(OPEN, { keys: [key], arguments: [input.lockToken, input.startedAt.toISOString(), String(TTL_SECONDS)] });
  } catch { throw new Error("rate-limit-unavailable"); }
  if (!Array.isArray(raw) || raw.length % 2) throw new Error("INVALID_ANILIST_PROGRESS");
  const values = new Map<string, string>();
  for (let i = 0; i < raw.length; i += 2) values.set(String(raw[i]), String(raw[i + 1]));
  const startedAt = new Date(values.get("startedAt") ?? "");
  if (!Number.isFinite(startedAt.getTime())) throw new Error("INVALID_ANILIST_PROGRESS");
  return {
    startedAt,
    read(page) {
      const value = values.get(String(page));
      return value ? JSON.parse(value) as JSONValue : null;
    },
    async write(page, payload) {
      let saved: unknown;
      try {
        saved = await redis.eval(WRITE, { keys: [key], arguments: [input.lockToken, String(page), JSON.stringify(payload)] });
      } catch { throw new Error("rate-limit-unavailable"); }
      if (Number(saved) !== 1) throw new Error("STALE_SNAPSHOT_JOB");
    },
    async clear() {
      try { await redis.eval(CLEAR, { keys: [key], arguments: [input.lockToken] }); }
      catch { throw new Error("rate-limit-unavailable"); }
    },
  };
}
