import { and, asc, desc, eq, inArray, isNotNull, isNull, lt, lte, sql } from "drizzle-orm";

import { db } from "@/db";
import { jobRuns, jobs } from "@/db/schema";
import {
  calculateJobRetryDelaySeconds,
  AD_HOC_JOB_HISTORY_RETENTION_DAYS,
  type JobRunSource,
  type JobRunStatus,
} from "@/lib/jobs/model";

export type JobRunPolicy = {
  maxAttempts: number;
  retryBaseSeconds: number;
  retryMaxSeconds: number;
  timeoutSeconds: number;
};

export type CreateJobRunInput = JobRunPolicy & {
  availableAt?: Date;
  createdByAdminId?: number | null;
  jobId?: number | null;
  payload: Record<string, unknown>;
  retryOfRunId?: number | null;
  scheduledFor?: Date;
  source: JobRunSource;
  type: string;
};

function jobRunValues(input: CreateJobRunInput, now: Date) {
  return {
    ...input,
    availableAt: input.availableAt ?? now,
    createdByAdminId: input.createdByAdminId ?? null,
    jobId: input.jobId ?? null,
    retryOfRunId: input.retryOfRunId ?? null,
    scheduledFor: input.scheduledFor ?? now,
  };
}

export async function createJobRun(input: CreateJobRunInput, now = new Date()) {
  const [run] = await db.insert(jobRuns).values(jobRunValues(input, now)).returning();
  return run;
}

export async function getJobById(id: number) {
  const [job] = await db.select().from(jobs).where(eq(jobs.id, id)).limit(1);
  return job ?? null;
}

export async function getJobRunById(id: number) {
  const [run] = await db.select().from(jobRuns).where(eq(jobRuns.id, id)).limit(1);
  return run ?? null;
}

export async function createPeriodicJob(input: {
  code: string;
  cronExpression: string;
  enabled: boolean;
  historyRetentionDays: number;
  nextRunAt: Date;
  payload: Record<string, unknown>;
  policy: JobRunPolicy;
  type: string;
}) {
  const [job] = await db.insert(jobs).values({
    code: input.code,
    cronExpression: input.cronExpression,
    enabled: input.enabled,
    historyRetentionDays: input.historyRetentionDays,
    maxAttempts: input.policy.maxAttempts,
    nextRunAt: input.nextRunAt,
    payload: input.payload,
    retryBaseSeconds: input.policy.retryBaseSeconds,
    retryMaxSeconds: input.policy.retryMaxSeconds,
    timeoutSeconds: input.policy.timeoutSeconds,
    type: input.type,
  }).returning();
  return job;
}

export async function updatePeriodicJob(input: {
  code: string;
  cronExpression: string;
  enabled: boolean;
  id: number;
  historyRetentionDays: number;
  nextRunAt: Date;
  payload: Record<string, unknown>;
  policy: JobRunPolicy;
  type: string;
}) {
  const [job] = await db.update(jobs).set({
    code: input.code,
    cronExpression: input.cronExpression,
    enabled: input.enabled,
    historyRetentionDays: input.historyRetentionDays,
    maxAttempts: input.policy.maxAttempts,
    nextRunAt: input.nextRunAt,
    payload: input.payload,
    retryBaseSeconds: input.policy.retryBaseSeconds,
    retryMaxSeconds: input.policy.retryMaxSeconds,
    timeoutSeconds: input.policy.timeoutSeconds,
    type: input.type,
    updatedAt: new Date(),
  }).where(eq(jobs.id, input.id)).returning();
  return job ?? null;
}

export async function setPeriodicJobEnabled(id: number, enabled: boolean) {
  const [job] = await db.update(jobs).set({ enabled, updatedAt: new Date() })
    .where(eq(jobs.id, id)).returning();
  return job ?? null;
}

export async function cancelQueuedJobRun(id: number, now = new Date()) {
  const [run] = await db.update(jobRuns).set({
    cancelledAt: now,
    finishedAt: now,
    status: "cancelled",
    updatedAt: now,
  }).where(and(eq(jobRuns.id, id), eq(jobRuns.status, "queued"))).returning();
  return run ?? null;
}

export async function retryFailedJobRun(id: number, createdByAdminId: number | null, now = new Date()) {
  return db.transaction(async (tx) => {
    const [source] = await tx.select().from(jobRuns)
      .where(and(eq(jobRuns.id, id), eq(jobRuns.status, "failed"))).for("update").limit(1);
    if (!source) return null;
    const [run] = await tx.insert(jobRuns).values(jobRunValues({
      availableAt: now,
      createdByAdminId,
      jobId: source.jobId,
      maxAttempts: source.maxAttempts,
      payload: source.payload,
      retryBaseSeconds: source.retryBaseSeconds,
      retryMaxSeconds: source.retryMaxSeconds,
      retryOfRunId: source.id,
      scheduledFor: now,
      source: "manual",
      timeoutSeconds: source.timeoutSeconds,
      type: source.type,
    }, now)).returning();
    return run;
  });
}

export async function claimDueScheduledJobs(input: {
  getNextRunAt: (expression: string, from: Date) => Date;
  limit: number;
  now?: Date;
}) {
  const now = input.now ?? new Date();
  const limit = Math.max(1, Math.min(input.limit, 100));
  return db.transaction(async (tx) => {
    const dueJobs = await tx.select().from(jobs).where(and(eq(jobs.enabled, true), lte(jobs.nextRunAt, now)))
      .orderBy(asc(jobs.nextRunAt), asc(jobs.id)).limit(limit).for("update", { skipLocked: true });
    const runs = [];
    for (const job of dueJobs) {
      const [run] = await tx.insert(jobRuns).values({
        availableAt: now,
        jobId: job.id,
        maxAttempts: job.maxAttempts,
        payload: job.payload,
        retryBaseSeconds: job.retryBaseSeconds,
        retryMaxSeconds: job.retryMaxSeconds,
        scheduledFor: job.nextRunAt,
        source: "schedule",
        timeoutSeconds: job.timeoutSeconds,
        type: job.type,
      }).onConflictDoNothing().returning();
      if (run) runs.push(run);
      await tx.update(jobs).set({ nextRunAt: input.getNextRunAt(job.cronExpression, now), updatedAt: now })
        .where(eq(jobs.id, job.id));
    }
    return runs;
  });
}

export async function claimNextJobRun(input: { lockedBy: string; now?: Date }) {
  const now = input.now ?? new Date();
  return db.transaction(async (tx) => {
    const [candidate] = await tx.select({ id: jobRuns.id }).from(jobRuns)
      .where(and(eq(jobRuns.status, "queued"), lte(jobRuns.availableAt, now)))
      .orderBy(asc(jobRuns.availableAt), asc(jobRuns.id)).limit(1).for("update", { skipLocked: true });
    if (!candidate) return null;
    const [run] = await tx.select().from(jobRuns).where(eq(jobRuns.id, candidate.id)).limit(1);
    if (!run) return null;
    const token = crypto.randomUUID();
    const lockExpiresAt = new Date(now.getTime() + run.timeoutSeconds * 1000);
    const [claimed] = await tx.update(jobRuns).set({
      attempts: run.attempts + 1,
      lockExpiresAt,
      lockToken: token,
      lockedAt: now,
      lockedBy: input.lockedBy,
      startedAt: now,
      status: "running",
      updatedAt: now,
    }).where(and(eq(jobRuns.id, run.id), eq(jobRuns.status, "queued"))).returning();
    return claimed ?? null;
  });
}

export async function recoverExpiredJobRuns(limit = 100, now = new Date()) {
  const safeLimit = Math.max(1, Math.min(limit, 100));
  return db.transaction(async (tx) => {
    const candidates = await tx.select().from(jobRuns)
      .where(and(eq(jobRuns.status, "running"), lte(jobRuns.lockExpiresAt, now)))
      .orderBy(asc(jobRuns.lockExpiresAt), asc(jobRuns.id)).limit(safeLimit).for("update", { skipLocked: true });
    let requeued = 0;
    let failed = 0;
    for (const run of candidates) {
      const exhausted = run.attempts >= run.maxAttempts;
      const retryAt = new Date(now.getTime() + calculateJobRetryDelaySeconds({
        attempts: run.attempts,
        baseSeconds: run.retryBaseSeconds,
        maxSeconds: run.retryMaxSeconds,
      }) * 1000);
      const tokenCondition = run.lockToken
        ? eq(jobRuns.lockToken, run.lockToken)
        : sql`${jobRuns.lockToken} is null`;
      await tx.update(jobRuns).set(exhausted ? {
        errorCode: "lease-expired",
        errorMessage: "Время аренды выполнения истекло.",
        finishedAt: now,
        lockExpiresAt: null,
        lockToken: null,
        lockedAt: null,
        lockedBy: null,
        status: "failed",
        updatedAt: now,
      } : {
        availableAt: retryAt,
        errorCode: "lease-expired",
        errorMessage: "Время аренды выполнения истекло; задача будет повторена.",
        lockExpiresAt: null,
        lockToken: null,
        lockedAt: null,
        lockedBy: null,
        status: "queued",
        updatedAt: now,
      }).where(and(eq(jobRuns.id, run.id), eq(jobRuns.status, "running"), tokenCondition));
      if (exhausted) failed += 1; else requeued += 1;
    }
    return { failed, requeued };
  });
}

export async function finishJobRun(input: {
  errorCode?: string | null;
  errorMessage?: string | null;
  id: number;
  lockToken: string;
  now?: Date;
  status: Extract<JobRunStatus, "succeeded" | "failed">;
}) {
  const now = input.now ?? new Date();
  const [run] = await db.update(jobRuns).set({
    errorCode: input.errorCode ?? null,
    errorMessage: input.errorMessage ?? null,
    finishedAt: now,
    lockExpiresAt: null,
    lockToken: null,
    lockedAt: null,
    lockedBy: null,
    status: input.status,
    updatedAt: now,
  }).where(and(eq(jobRuns.id, input.id), eq(jobRuns.status, "running"), eq(jobRuns.lockToken, input.lockToken))).returning();
  return run ?? null;
}

export async function requeueJobRun(input: { errorCode: string; errorMessage: string; id: number; lockToken: string; now?: Date }) {
  const now = input.now ?? new Date();
  const [run] = await db.select().from(jobRuns).where(and(eq(jobRuns.id, input.id), eq(jobRuns.status, "running"), eq(jobRuns.lockToken, input.lockToken))).limit(1);
  if (!run) return null;
  const availableAt = new Date(now.getTime() + calculateJobRetryDelaySeconds({ attempts: run.attempts, baseSeconds: run.retryBaseSeconds, maxSeconds: run.retryMaxSeconds }) * 1000);
  const [updated] = await db.update(jobRuns).set({
    availableAt,
    errorCode: input.errorCode,
    errorMessage: input.errorMessage,
    lockExpiresAt: null,
    lockToken: null,
    lockedAt: null,
    lockedBy: null,
    status: "queued",
    updatedAt: now,
  }).where(and(eq(jobRuns.id, input.id), eq(jobRuns.status, "running"), eq(jobRuns.lockToken, input.lockToken))).returning();
  return updated ?? null;
}

export async function getAdminJobs() {
  return db.select().from(jobs).orderBy(asc(jobs.code));
}

export async function getLatestJobRuns() {
  return db.selectDistinctOn([jobRuns.jobId], {
    attempts: jobRuns.attempts,
    errorMessage: jobRuns.errorMessage,
    finishedAt: jobRuns.finishedAt,
    id: jobRuns.id,
    jobId: jobRuns.jobId,
    scheduledFor: jobRuns.scheduledFor,
    status: jobRuns.status,
  }).from(jobRuns)
    .where(isNotNull(jobRuns.jobId))
    .orderBy(jobRuns.jobId, desc(jobRuns.createdAt), desc(jobRuns.id));
}

export async function getAdminJobRuns(input: {
  jobId?: number | "adhoc";
  page: number;
  pageSize: number;
  status?: JobRunStatus | null;
  type?: string | null;
}) {
  const conditions = [
    ...(input.jobId === "adhoc" ? [isNull(jobRuns.jobId)] : input.jobId ? [eq(jobRuns.jobId, input.jobId)] : []),
    ...(input.status ? [eq(jobRuns.status, input.status)] : []),
    ...(input.type ? [eq(jobRuns.type, input.type)] : []),
  ];
  const where = conditions.length > 0 ? and(...conditions) : undefined;
  const pageSize = [25, 50, 100].includes(input.pageSize) ? input.pageSize : 25;
  const [{ count }] = await db.select({ count: sql<number>`count(*)::int` }).from(jobRuns).where(where);
  const totalPages = Math.max(1, Math.ceil(count / pageSize));
  const page = Math.max(1, Math.min(input.page, totalPages));
  const items = await db.select().from(jobRuns).where(where)
    .orderBy(desc(jobRuns.createdAt), desc(jobRuns.id))
    .limit(pageSize)
    .offset((page - 1) * pageSize);
  return { items, page, pageSize, totalCount: count, totalPages };
}

export async function cleanupJobRunHistory(now = new Date()) {
  const configuredJobs = await db.select({
    historyRetentionDays: jobs.historyRetentionDays,
    id: jobs.id,
  }).from(jobs);
  const terminalStatuses: JobRunStatus[] = ["succeeded", "failed", "cancelled"];
  let deleted = 0;
  await db.transaction(async (tx) => {
    for (const job of configuredJobs) {
      const cutoff = new Date(now.getTime() - job.historyRetentionDays * 24 * 60 * 60 * 1000);
      const rows = await tx.delete(jobRuns).where(and(
        eq(jobRuns.jobId, job.id),
        inArray(jobRuns.status, terminalStatuses),
        lt(jobRuns.finishedAt, cutoff),
      )).returning({ id: jobRuns.id });
      deleted += rows.length;
    }
    const adHocCutoff = new Date(now.getTime() - AD_HOC_JOB_HISTORY_RETENTION_DAYS * 24 * 60 * 60 * 1000);
    const adHocRows = await tx.delete(jobRuns).where(and(
      isNull(jobRuns.jobId),
      inArray(jobRuns.status, terminalStatuses),
      lt(jobRuns.finishedAt, adHocCutoff),
    )).returning({ id: jobRuns.id });
    deleted += adHocRows.length;
  });
  return deleted;
}
