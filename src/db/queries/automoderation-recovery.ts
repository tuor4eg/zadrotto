import { and, eq, inArray, sql } from "drizzle-orm";

import { automoderationChecks, jobRuns } from "@/db/schema";
import type { DbTransaction } from "@/db/transaction";
import { guardSnapshotJob, type SnapshotJobGuard } from "./provider-snapshots";
import { MEDIA_AUTOMODERATION_JOB_TYPE } from "@/lib/automoderation/model";

/** The job row stays locked until the caller commits its check/media changes. */
export async function guardAutomoderationJob(tx: DbTransaction, checkId: number, guard?: SnapshotJobGuard) {
  if (!guard) return;
  await guardSnapshotJob(tx, guard);
  const [run] = await tx.select({ id: jobRuns.id }).from(jobRuns).where(and(
    eq(jobRuns.id, guard.runId),
    eq(jobRuns.type, MEDIA_AUTOMODERATION_JOB_TYPE),
    sql`${jobRuns.payload}->>'checkId' = ${String(checkId)}`,
  )).limit(1);
  if (!run) throw new Error("INVALID_AUTOMODERATION_JOB");
}

/** Called after retry/failure invalidates the old job token, in that same transaction. */
export async function reconcileAutomoderationJob(tx: DbTransaction, input: { checkId: number; retry: boolean }) {
  const now = new Date();
  return tx.update(automoderationChecks).set(input.retry ? {
    status: "pending", decision: null, reasonCodes: [], checkResults: {}, completedAt: null, updatedAt: now,
  } : {
    status: "completed", decision: "NEEDS_REVIEW", reasonCodes: ["check_execution_failed"],
    completedAt: now, updatedAt: now,
  }).where(and(
    eq(automoderationChecks.id, input.checkId),
    inArray(automoderationChecks.status, ["pending", "running"]),
  )).returning({ id: automoderationChecks.id });
}

/** Uses the existing active-job expression index; never casts untrusted JSON. */
export async function recoverOrphanedAutomoderationChecks(tx: DbTransaction, limit = 50) {
  const safeLimit = Math.max(1, Math.min(limit, 100));
  const result = await tx.execute<{ id: number }>(sql`
    with candidates as (
      select checks.id from ${automoderationChecks} checks
      where checks.status in ('pending', 'running')
        and not exists (
          select 1 from ${jobRuns} active_job
          where active_job.type = 'moderation.auto-check'
            and active_job.status in ('queued', 'running')
            and active_job.payload->>'checkId' = checks.id::text
        )
      order by checks.created_at, checks.id
      limit ${safeLimit} for update of checks skip locked
    )
    update ${automoderationChecks} checks
    set status = 'completed', decision = 'NEEDS_REVIEW',
      reason_codes = '["check_execution_failed"]'::jsonb,
      completed_at = clock_timestamp(), updated_at = clock_timestamp()
    from candidates where checks.id = candidates.id
      and checks.status in ('pending', 'running')
      and not exists (
        select 1 from ${jobRuns} active_job
        where active_job.type = 'moderation.auto-check'
          and active_job.status in ('queued', 'running')
          and active_job.payload->>'checkId' = checks.id::text
      )
    returning checks.id
  `);
  return Array.from(result);
}
