import { drizzle } from "drizzle-orm/postgres-js";

import { createPostgresClient, type PostgresClient } from "@/lib/services/postgres";
import * as schema from "./schema";

function createDb(client: PostgresClient) {
  return drizzle(client, { schema });
}

type Db = ReturnType<typeof createDb>;

let cachedDbClient: PostgresClient | null = null;
let cachedDb: Db | null = null;

export function getDbClient() {
  cachedDbClient ??= createPostgresClient();
  return cachedDbClient;
}

export function getDb() {
  cachedDb ??= createDb(getDbClient());
  return cachedDb;
}

export const dbClient = new Proxy({} as PostgresClient, {
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
