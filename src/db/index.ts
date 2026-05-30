import { drizzle } from "drizzle-orm/postgres-js";
import postgres from "postgres";

import * as schema from "./schema";

function createDbClient() {
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

function createDb(client: ReturnType<typeof createDbClient>) {
  return drizzle(client, { schema });
}

type DbClient = ReturnType<typeof createDbClient>;
type Db = ReturnType<typeof createDb>;

let cachedDbClient: DbClient | null = null;
let cachedDb: Db | null = null;

export function getDbClient() {
  cachedDbClient ??= createDbClient();
  return cachedDbClient;
}

export function getDb() {
  cachedDb ??= createDb(getDbClient());
  return cachedDb;
}

export const dbClient = new Proxy({} as DbClient, {
  get(_target, property, receiver) {
    const value = Reflect.get(getDbClient(), property, receiver);
    return typeof value === "function" ? value.bind(getDbClient()) : value;
  },
});

export const db = new Proxy({} as Db, {
  get(_target, property, receiver) {
    const value = Reflect.get(getDb(), property, receiver);
    return typeof value === "function" ? value.bind(getDb()) : value;
  },
});
