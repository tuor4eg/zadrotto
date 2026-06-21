import { asc, eq, sql } from "drizzle-orm";

import { db } from "@/db";
import { adminUsers } from "@/db/schema";

export async function getAdminUserByLogin(login: string) {
  const [adminUser] = await db
    .select({
      id: adminUsers.id,
      login: adminUsers.login,
      passwordHash: adminUsers.passwordHash,
      lastLoginAt: adminUsers.lastLoginAt,
    })
    .from(adminUsers)
    .where(eq(adminUsers.login, login))
    .limit(1);

  return adminUser ?? null;
}

export async function getAdminUserById(id: number) {
  const [adminUser] = await db
    .select({
      id: adminUsers.id,
      login: adminUsers.login,
      sessionInvalidatedAt: adminUsers.sessionInvalidatedAt,
      updatedAt: adminUsers.updatedAt,
      lastLoginAt: adminUsers.lastLoginAt,
    })
    .from(adminUsers)
    .where(eq(adminUsers.id, id))
    .limit(1);

  return adminUser ?? null;
}

export async function getAdminUserCredentialsById(id: number) {
  const [adminUser] = await db
    .select({
      id: adminUsers.id,
      passwordHash: adminUsers.passwordHash,
    })
    .from(adminUsers)
    .where(eq(adminUsers.id, id))
    .limit(1);

  return adminUser ?? null;
}

export async function getAdminUsersCount() {
  const [row] = await db
    .select({
      count: sql<number>`count(${adminUsers.id})::int`,
    })
    .from(adminUsers);

  return row?.count ?? 0;
}

export async function getAdminUserOptions() {
  return db
    .select({
      id: adminUsers.id,
      login: adminUsers.login,
    })
    .from(adminUsers)
    .orderBy(asc(adminUsers.login));
}

export async function createAdminUser(login: string, passwordHash: string) {
  await db
    .insert(adminUsers)
    .values({
      login,
      passwordHash,
    })
    .onConflictDoNothing({
      target: adminUsers.login,
    });
}

export async function updateAdminLastLoginAt(id: number) {
  const now = new Date();
  const [adminUser] = await db
    .update(adminUsers)
    .set({ lastLoginAt: now, updatedAt: now })
    .where(eq(adminUsers.id, id))
    .returning({ sessionInvalidatedAt: adminUsers.sessionInvalidatedAt });

  return adminUser?.sessionInvalidatedAt ?? now;
}

export async function updateAdminPasswordHash(id: number, passwordHash: string) {
  const now = new Date();
  const [adminUser] = await db
    .update(adminUsers)
    .set({ passwordHash, sessionInvalidatedAt: now, updatedAt: now })
    .where(eq(adminUsers.id, id))
    .returning({ sessionInvalidatedAt: adminUsers.sessionInvalidatedAt });

  return adminUser?.sessionInvalidatedAt ?? null;
}

export async function revokeAdminSessions(id: number) {
  const now = new Date();

  await db
    .update(adminUsers)
    .set({ sessionInvalidatedAt: now, updatedAt: now })
    .where(eq(adminUsers.id, id));
}
