import type { RedisClientType } from "redis";

import {
  getEligibleDailyDossierById,
  getRandomDailyDossierCandidate,
  type MainPageMediaItem,
} from "@/db/queries/main-page";
import { getArchiveSettings } from "@/db/queries/archive-settings";
import { getRedisClient } from "@/lib/services/redis";
import { DEFAULT_DAILY_DOSSIER_MIN_AVERAGE_SCORE } from "@/lib/main-page/daily-dossier-settings";

const CACHE_KEY_PREFIX = "main-page:daily-dossier";
const EXPIRY_BUFFER_SECONDS = 60;

export type DailyDossierRedisClient = Pick<RedisClientType, "eval" | "get" | "set">;

type DailyDossierDependencies = {
  client: DailyDossierRedisClient | null;
  getEligibleById: (id: number) => Promise<MainPageMediaItem | null>;
  getRandomCandidate: () => Promise<MainPageMediaItem | null>;
};

const MAX_ELECTION_ATTEMPTS = 3;

export function getUtcDateKey(now: Date) {
  return now.toISOString().slice(0, 10);
}

export function getDailyDossierCacheKey(now: Date) {
  return `${CACHE_KEY_PREFIX}:${getUtcDateKey(now)}`;
}

export function getSecondsUntilNextUtcMidnight(now: Date) {
  const nextMidnightUtc = Date.UTC(
    now.getUTCFullYear(),
    now.getUTCMonth(),
    now.getUTCDate() + 1,
  );

  return Math.max(1, Math.ceil((nextMidnightUtc - now.getTime()) / 1000));
}

function parseCachedId(value: string | null) {
  const id = Number(value);

  return Number.isInteger(id) && id > 0 ? id : null;
}

async function replaceInvalidCachedId(input: {
  client: DailyDossierRedisClient;
  expectedValue: string;
  key: string;
  replacementId: number;
  ttlSeconds: number;
}) {
  return input.client.eval(
    `if redis.call("GET", KEYS[1]) == ARGV[1] then
      redis.call("SET", KEYS[1], ARGV[2], "EX", ARGV[3])
      return 1
    end
    return 0`,
    {
      arguments: [
        input.expectedValue,
        String(input.replacementId),
        String(input.ttlSeconds),
      ],
      keys: [input.key],
    },
  );
}

async function readEligibleCachedItem(
  client: DailyDossierRedisClient,
  key: string,
  getEligibleById: DailyDossierDependencies["getEligibleById"],
) {
  const cachedValue = await client.get(key);
  const cachedId = parseCachedId(cachedValue);

  if (!cachedId) {
    return { cachedId: null, cachedValue, item: null };
  }

  return {
    cachedId,
    cachedValue,
    item: await getEligibleById(cachedId),
  };
}

export async function getDailyDossierWithDependencies(
  dependencies: DailyDossierDependencies,
  now = new Date(),
): Promise<MainPageMediaItem | null> {
  const { client, getEligibleById, getRandomCandidate } = dependencies;

  if (!client) {
    return getRandomCandidate();
  }

  try {
    const key = getDailyDossierCacheKey(now);
    const ttlSeconds = getSecondsUntilNextUtcMidnight(now) + EXPIRY_BUFFER_SECONDS;

    for (let attempt = 0; attempt < MAX_ELECTION_ATTEMPTS; attempt += 1) {
      const cached = await readEligibleCachedItem(client, key, getEligibleById);

      if (cached.item) {
        return cached.item;
      }

      const candidate = await getRandomCandidate();

      if (!candidate) {
        return null;
      }

      if (cached.cachedValue !== null) {
        const replaced = await replaceInvalidCachedId({
          client,
          expectedValue: cached.cachedValue,
          key,
          replacementId: candidate.id,
          ttlSeconds,
        });

        if (Number(replaced) === 1) {
          return candidate;
        }
      } else {
        const won = await client.set(key, String(candidate.id), { EX: ttlSeconds, NX: true });

        if (won === "OK") {
          return candidate;
        }
      }
    }

    const winner = await readEligibleCachedItem(client, key, getEligibleById);

    return winner.item;
  } catch (error) {
    console.error("Daily dossier cache error", error);
    return getRandomCandidate();
  }
}

export async function getDailyDossier(
  currentAuthorId?: number,
  now = new Date(),
): Promise<MainPageMediaItem | null> {
  let minAverageScore = DEFAULT_DAILY_DOSSIER_MIN_AVERAGE_SCORE;

  try {
    const settings = await getArchiveSettings();
    minAverageScore = settings.dailyDossierMinAverageScore;
    const client = await getRedisClient();
    return getDailyDossierWithDependencies({
      client,
      getEligibleById: (id) => getEligibleDailyDossierById({
        currentAuthorId,
        id,
        minAverageScore,
      }),
      getRandomCandidate: () => getRandomDailyDossierCandidate({
        currentAuthorId,
        minAverageScore,
      }),
    }, now);
  } catch (error) {
    console.error("Daily dossier cache error", error);
    return getRandomDailyDossierCandidate({ currentAuthorId, minAverageScore });
  }
}
