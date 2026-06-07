import postgres from "postgres";

import {
  buildMissingServiceConfigHealthCheck,
  buildServiceHealthCheck,
  getErrorMessage,
  type ServiceHealthCheck,
} from "./health";

export function createPostgresClient() {
  const connectionString = process.env.DATABASE_URL;
  const maxConnections = Number(process.env.DATABASE_MAX_CONNECTIONS ?? 3);

  if (!connectionString) {
    throw new Error("DATABASE_URL is not set");
  }

  return postgres(connectionString, {
    idle_timeout: 20,
    max: Number.isSafeInteger(maxConnections) && maxConnections > 0 ? maxConnections : 3,
    prepare: false,
  });
}

export type PostgresClient = ReturnType<typeof createPostgresClient>;

export async function checkPostgresHealth(): Promise<ServiceHealthCheck> {
  const startedAt = Date.now();

  if (!process.env.DATABASE_URL?.trim()) {
    return buildMissingServiceConfigHealthCheck({
      code: "postgres",
      name: "PostgreSQL",
      message: "DATABASE_URL не задан.",
    });
  }

  const client = createPostgresClient();

  try {
    await client`select 1`;

    return buildServiceHealthCheck({
      code: "postgres",
      name: "PostgreSQL",
      status: "healthy",
      message: "Соединение с базой работает.",
      startedAt,
    });
  } catch (error) {
    return buildServiceHealthCheck({
      code: "postgres",
      name: "PostgreSQL",
      status: "unhealthy",
      message: getErrorMessage(error),
      startedAt,
    });
  } finally {
    await client.end({ timeout: 1 }).catch(() => undefined);
  }
}
