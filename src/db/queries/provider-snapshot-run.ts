import { and, eq } from "drizzle-orm";
import { db } from "@/db";
import { jobRuns } from "@/db/schema";
import { parseSnapshotJobPayload, PROVIDER_SNAPSHOT_JOB_TYPE } from "@/lib/providers/snapshot-job-payload";

/** Explicit run lookup by the primary key; never scans the jobs journal. */
export async function getProviderSnapshotRun(runId: number) {
  if (!Number.isSafeInteger(runId) || runId <= 0) return null;
  const [run] = await db.select({ id: jobRuns.id, status: jobRuns.status, payload: jobRuns.payload,
    errorMessage: jobRuns.errorMessage, createdAt: jobRuns.createdAt, finishedAt: jobRuns.finishedAt,
  }).from(jobRuns).where(and(eq(jobRuns.id, runId), eq(jobRuns.type, PROVIDER_SNAPSHOT_JOB_TYPE)));
  if (!run) return null;
  try {
    const payload = parseSnapshotJobPayload(run.payload);
    return { ...run, payload };
  } catch { return null; }
}
/** A record page must never display a run selected for another record or a bulk run. */
export async function getBookSnapshotRun(mediaItemId: number, runId: number) {
  const run = await getProviderSnapshotRun(runId);
  if (run?.payload.entityType === "creator") return null;
  if (run?.payload.mediaItemIds?.length !== 1 || run.payload.mediaItemIds[0] !== mediaItemId) return null;
  return run;
}
export type BookSnapshotRun = NonNullable<Awaited<ReturnType<typeof getBookSnapshotRun>>>;

export async function getCreatorSnapshotRun(creatorId: number, runId: number) {
  const run = await getProviderSnapshotRun(runId);
  if (run?.payload.entityType !== "creator" || run.payload.creatorIds?.length !== 1 || run.payload.creatorIds[0] !== creatorId) return null;
  return run;
}
