import { and, desc, eq, inArray, lt, sql } from "drizzle-orm";
import { db } from "@/db";
import { adminExports, jobRuns } from "@/db/schema";
import type { AdminExportEntityType } from "@/lib/admin-exports/model";

export type AdminExportFilters = {
  q?: string;
  authorId?: number;
  mediaCarrierId?: number;
  mediaType?: string;
  metadata?: "missing" | "absent";
};

export async function insertAdminExport(input: { adminId: number; entityType: AdminExportEntityType; fields: string[]; filters: AdminExportFilters; sort: string; expiresAt: Date }) {
  const [row] = await db.insert(adminExports).values({ createdByAdminId: input.adminId, entityType: input.entityType, fields: input.fields, filters: input.filters, sort: input.sort, expiresAt: input.expiresAt }).returning();
  return row;
}

export async function listAdminExports(input: { adminId: number; page?: number; pageSize?: number }) {
  const pageSize = Math.min(100, Math.max(1, input.pageSize ?? 25));
  const page = Math.max(1, input.page ?? 1);
  const [items, countRows] = await Promise.all([
    db.select().from(adminExports).where(eq(adminExports.createdByAdminId, input.adminId)).orderBy(desc(adminExports.createdAt)).limit(pageSize).offset((page - 1) * pageSize),
    db.select({ id: adminExports.id }).from(adminExports).where(eq(adminExports.createdByAdminId, input.adminId)),
  ]);
  return { items, page, pageSize, totalCount: countRows.length, totalPages: Math.max(1, Math.ceil(countRows.length / pageSize)) };
}

export async function getAdminExportForOwner(id: string, adminId: number) {
  const [row] = await db.select().from(adminExports).where(and(eq(adminExports.id, id), eq(adminExports.createdByAdminId, adminId))).limit(1);
  return row ?? null;
}
export async function getActiveAdminExports(adminId: number) {
  return db.select().from(adminExports).where(and(eq(adminExports.createdByAdminId, adminId), inArray(adminExports.status, ["queued", "running"]))).orderBy(desc(adminExports.createdAt)).limit(100);
}
export async function getAdminExportById(id: string) {
  const [row] = await db.select().from(adminExports).where(eq(adminExports.id, id)).limit(1);
  return row ?? null;
}
export async function markAdminExportRunning(id: string) {
  const [row] = await db.update(adminExports).set({ status: "running", startedAt: new Date(), errorMessage: null, updatedAt: new Date() }).where(and(eq(adminExports.id, id), inArray(adminExports.status, ["queued", "running", "failed"]))).returning();
  return row ?? null;
}
export async function markAdminExportReady(input: { id: string; objectKey: string; rowCount: number; fileSize: number }) {
  await db.update(adminExports).set({ status: "ready", objectKey: input.objectKey, rowCount: input.rowCount, fileSize: input.fileSize, finishedAt: new Date(), updatedAt: new Date() }).where(eq(adminExports.id, input.id));
}
export async function markAdminExportFailed(id: string, message = "Не удалось сформировать экспорт.") {
  await db.update(adminExports).set({ status: "failed", errorMessage: message, finishedAt: new Date(), updatedAt: new Date() }).where(eq(adminExports.id, id));
}
export async function requeueAdminExport(id: string, adminId: number) {
  const [row] = await db.update(adminExports).set({ status: "queued", errorMessage: null, startedAt: null, finishedAt: null, objectKey: null, rowCount: null, fileSize: null, updatedAt: new Date() }).where(and(eq(adminExports.id, id), eq(adminExports.createdByAdminId, adminId), eq(adminExports.status, "failed"))).returning();
  return row ?? null;
}
export async function getExpiredAdminExports(now = new Date()) {
  return db.select().from(adminExports).where(and(lt(adminExports.expiresAt, now), inArray(adminExports.status, ["queued", "ready", "failed"]))).limit(100);
}
export async function markAdminExportExpired(id: string) {
  await db.update(adminExports).set({ status: "expired", objectKey: null, updatedAt: new Date() }).where(eq(adminExports.id, id));
}

export async function cancelQueuedAdminExport(id: string, adminId: number) {
  return db.transaction(async (tx) => {
    const [cancelled] = await tx.update(adminExports).set({ status: "expired", updatedAt: new Date() })
      .where(and(eq(adminExports.id, id), eq(adminExports.createdByAdminId, adminId), eq(adminExports.status, "queued"))).returning();
    if (!cancelled) return null;
    const now = new Date();
    await tx.update(jobRuns).set({ status: "cancelled", cancelledAt: now, finishedAt: now, updatedAt: now })
      .where(and(eq(jobRuns.status, "queued"), sql`${jobRuns.payload}->>'exportId' = ${id}`));
    return cancelled;
  });
}
