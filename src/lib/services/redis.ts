import { createClient } from "redis";

import {
  buildMissingServiceConfigHealthCheck,
  buildServiceHealthCheck,
  getErrorMessage,
  type ServiceHealthCheck,
} from "./health";

function createRedisClient(url: string) {
  return createClient({ url });
}

type RedisClient = ReturnType<typeof createRedisClient>;

let cachedClient: RedisClient | null = null;
let connectionPromise: Promise<RedisClient | null> | null = null;

export function getRedisUrl() {
  return process.env.REDIS_URL?.trim() || null;
}

export async function getRedisClient() {
  const url = getRedisUrl();

  if (!url) {
    return null;
  }

  if (cachedClient?.isOpen) {
    return cachedClient;
  }

  connectionPromise ??= (async () => {
    const client = createRedisClient(url);

    client.on("error", (error) => {
      console.error("Redis error", error);
    });

    try {
      await client.connect();
      cachedClient = client;

      return client;
    } catch (error) {
      console.error(error);
      cachedClient = null;

      return null;
    } finally {
      connectionPromise = null;
    }
  })();

  return connectionPromise;
}

export async function checkRedisHealth(): Promise<ServiceHealthCheck> {
  const startedAt = Date.now();
  const url = getRedisUrl();

  if (!url) {
    return buildMissingServiceConfigHealthCheck({
      code: "redis",
      name: "Redis",
      message: "REDIS_URL не задан.",
    });
  }

  try {
    const client = await getRedisClient();

    if (!client) {
      return buildServiceHealthCheck({
        code: "redis",
        name: "Redis",
        status: "unhealthy",
        message: "Не удалось подключиться к Redis.",
        startedAt,
      });
    }

    await client.ping();

    return buildServiceHealthCheck({
      code: "redis",
      name: "Redis",
      status: "healthy",
      message: "Redis отвечает на ping.",
      startedAt,
    });
  } catch (error) {
    return buildServiceHealthCheck({
      code: "redis",
      name: "Redis",
      status: "unhealthy",
      message: getErrorMessage(error),
      startedAt,
    });
  }
}
