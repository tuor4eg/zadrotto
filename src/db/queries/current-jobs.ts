import { asc, desc, eq, inArray, sql } from "drizzle-orm";
import { db } from "@/db";
import { jobs, jobRuns } from "@/db/schema";
import { clampPage, getOffset, getTotalPages } from "@/lib/common/pagination";

const active = () => inArray(jobRuns.status, ["queued", "running"]);
export function currentJobCountsQuery(executor: Pick<typeof db, "select"> = db) {
  return executor.select({ status: jobRuns.status, count: sql<number>`count(*)::int` }).from(jobRuns).where(active()).groupBy(jobRuns.status);
}
export function currentJobRunsQuery(page: number, pageSize: number, executor: Pick<typeof db, "select"> = db) {
  return executor.select({ id: jobRuns.id, type: jobRuns.type, jobId: jobRuns.jobId, jobCode: jobs.code,
    source: jobRuns.source, status: jobRuns.status, payload: jobRuns.payload, attempts: jobRuns.attempts, maxAttempts: jobRuns.maxAttempts,
    createdAt: jobRuns.createdAt, startedAt: jobRuns.startedAt, availableAt: jobRuns.availableAt, updatedAt: jobRuns.updatedAt,
    lockExpiresAt: jobRuns.lockExpiresAt, errorMessage: jobRuns.errorMessage,
  }).from(jobRuns).leftJoin(jobs, eq(jobs.id, jobRuns.jobId)).where(active())
    .orderBy(desc(jobRuns.status), asc(jobRuns.createdAt), asc(jobRuns.id)).limit(pageSize).offset(getOffset(page, pageSize));
}
export async function getCurrentJobRuns(input: { page: number; pageSize?: number }) {
  const pageSize = [25, 50, 100].includes(input.pageSize ?? 50) ? input.pageSize ?? 50 : 50;
  return db.transaction(async tx => {
    const counts = await currentJobCountsQuery(tx);
    const running = counts.find(row => row.status === "running")?.count ?? 0;
    const queued = counts.find(row => row.status === "queued")?.count ?? 0;
    const totalCount = running + queued;
    const totalPages = getTotalPages(totalCount, pageSize);
    const page = clampPage(input.page, totalPages);
    const items = await currentJobRunsQuery(page, pageSize, tx);
    return { items, running, queued, totalCount, page, pageSize, totalPages };
  }, { isolationLevel: "repeatable read", accessMode: "read only" });
}
