import { withSnapshotJobGuard, type SnapshotJobGuard } from "@/db/queries/provider-snapshots";
import { and, asc, desc, eq, inArray, lt, sql } from "drizzle-orm";
import { db } from "@/db";
import { adminExports, jobRuns } from "@/db/schema";
import type { AdminExportType } from "@/lib/admin-exports/model";

export type AdminExportFilters = {
  q?: string;
  authorId?: number;
  mediaCarrierId?: number;
  mediaType?: string;
  metadata?: "missing" | "absent";
  seriesBinding?: "missing";
};

export async function insertAdminExport(input: { adminId: number; entityType: AdminExportType; fields: string[]; filters: AdminExportFilters; sort: string; expiresAt: Date }) {
  const [row] = await db.insert(adminExports).values({ createdByAdminId: input.adminId, entityType: input.entityType, fields: input.fields, filters: input.filters, sort: input.sort, expiresAt: input.expiresAt }).returning();
  return row;
}

export async function insertDatabaseDumpExport(input: { adminId: number; expiresAt: Date }) {
  return db.transaction(async (tx) => {
    // Serialize requests by one administrator without keeping a transaction open during pg_dump.
    await tx.execute(sql`select pg_advisory_xact_lock(6432, ${input.adminId})`);
    const [existing] = await tx.select().from(adminExports).where(and(
      eq(adminExports.createdByAdminId, input.adminId),
      eq(adminExports.entityType, "database_dump"),
      inArray(adminExports.status, ["queued", "running"]),
    )).limit(1);
    if (existing) return { item: existing, created: false };
    const [item] = await tx.insert(adminExports).values({
      createdByAdminId: input.adminId, entityType: "database_dump", fields: [], filters: {}, sort: "none", expiresAt: input.expiresAt,
    }).returning();
    return { item, created: true };
  });
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
export async function markAdminExportRunning(id: string, jobGuard?: SnapshotJobGuard) {
  return withSnapshotJobGuard(jobGuard, async tx => {
  const [row] = await tx.update(adminExports).set({ status: "running", startedAt: new Date(), errorMessage: null, updatedAt: new Date() }).where(and(eq(adminExports.id, id), inArray(adminExports.status, ["queued", "running", "failed"]))).returning();
  return row ?? null;
  });
}
export async function markAdminExportReady(input: { id: string; objectKey: string; rowCount: number | null; fileSize: number; expiresAt?: Date }, jobGuard?: SnapshotJobGuard) {
  return withSnapshotJobGuard(jobGuard, async tx => {
  if (!Number.isSafeInteger(input.fileSize) || input.fileSize < 0) throw new Error("Некорректный размер экспорта.");
  await tx.update(adminExports).set({ status: "ready", objectKey: input.objectKey, rowCount: input.rowCount, fileSize: input.fileSize, ...(input.expiresAt ? { expiresAt: input.expiresAt } : {}), finishedAt: new Date(), updatedAt: new Date() }).where(eq(adminExports.id, input.id));
  });
}
export async function markAdminExportFailed(id: string, message = "Не удалось сформировать экспорт.", jobGuard?: SnapshotJobGuard) {
  return withSnapshotJobGuard(jobGuard, async tx => {
  await tx.update(adminExports).set({ status: "failed", errorMessage: message, finishedAt: new Date(), updatedAt: new Date() }).where(eq(adminExports.id, id));
  });
}
export async function requeueAdminExport(id: string, adminId: number, expiresAt?: Date) {
  const [row] = await db.update(adminExports).set({ status: "queued", errorMessage: null, startedAt: null, finishedAt: null, objectKey: null, rowCount: null, fileSize: null, ...(expiresAt ? { expiresAt } : {}), updatedAt: new Date() }).where(and(eq(adminExports.id, id), eq(adminExports.createdByAdminId, adminId), eq(adminExports.status, "failed"))).returning();
  return row ?? null;
}

export async function setAdminExportObjectKey(id: string, objectKey: string, jobGuard?: SnapshotJobGuard) {
  return withSnapshotJobGuard(jobGuard, async tx => {
  await tx.update(adminExports).set({ objectKey, updatedAt: new Date() }).where(and(eq(adminExports.id, id), eq(adminExports.status, "running")));
  });
}
export async function getExpiredAdminExports(now = new Date()) {
  return db.select().from(adminExports).where(and(lt(adminExports.expiresAt, now), inArray(adminExports.status, ["queued", "ready", "failed"]))).limit(100);
}
export async function markAdminExportExpired(id: string, jobGuard?: SnapshotJobGuard) {
  return withSnapshotJobGuard(jobGuard, async tx => {
  await tx.update(adminExports).set({ status: "expired", objectKey: null, updatedAt: new Date() }).where(eq(adminExports.id, id));
  });
}

export async function cancelQueuedAdminExport(id: string, adminId: number) {
  return db.transaction(async (tx) => {
    const [owner] = await tx.select({ id: adminExports.id }).from(adminExports).where(and(eq(adminExports.id, id), eq(adminExports.createdByAdminId, adminId)));
    if (!owner) return null;
    // Match fenced workers and general cancellation: job first, then export.
    const runs = await tx.select({ id: jobRuns.id, status: jobRuns.status }).from(jobRuns)
      .where(and(eq(jobRuns.type, "admin.export-generate"), inArray(jobRuns.status, ["queued", "running"]), sql`${jobRuns.payload}->>'exportId' = ${id}`))
      .orderBy(asc(jobRuns.id)).for("update");
    if (runs.some(run => run.status === "running")) return null;
    const now = new Date();
    const [cancelled] = await tx.update(adminExports).set({ status: "expired", updatedAt: now })
      .where(and(eq(adminExports.id, id), eq(adminExports.createdByAdminId, adminId), eq(adminExports.status, "queued"))).returning();
    if (!cancelled) return null;
    if (runs.length) await tx.update(jobRuns).set({ status: "cancelled", cancelledAt: now, finishedAt: now, updatedAt: now })
      .where(and(inArray(jobRuns.id, runs.map(run => run.id)), eq(jobRuns.status, "queued")));
    return cancelled;
  });
}
