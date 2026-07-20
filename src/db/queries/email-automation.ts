import { and, eq, isNull, lte, or } from "drizzle-orm";

import { db } from "@/db";
import { adminActivityLogs, emailAutomationJobs, emailAutomationSettings } from "@/db/schema";
import type { CreateActivityLogInput } from "@/db/queries/activity-logs";
import { EMAIL_AUTOMATION_DEFAULTS, EMAIL_AUTOMATION_LEASE_MS, type EmailAutomationSettingsInput, sanitizeEmailDeliveryError } from "@/lib/auth/email-automation";

export type EmailAutomationJobName = "delivery" | "cleanup";

export async function getEmailAutomationOverview() {
  const [settings, jobs] = await Promise.all([
    db.select().from(emailAutomationSettings).where(eq(emailAutomationSettings.id, 1)).limit(1),
    db.select().from(emailAutomationJobs),
  ]);
  return {
    settings: settings[0] ?? EMAIL_AUTOMATION_DEFAULTS,
    jobs: jobs.map((job) => ({
      ...job,
      lastError: job.lastError ? sanitizeEmailDeliveryError(job.lastError) : null,
    })),
  };
}

export async function saveEmailAutomationSettings(input: {
  settings: EmailAutomationSettingsInput;
  adminId: number;
  activityLog: CreateActivityLogInput;
}) {
  return db.transaction(async (tx) => {
    await tx.insert(emailAutomationSettings).values({ id: 1, ...input.settings, updatedByAdminId: input.adminId })
      .onConflictDoUpdate({ target: emailAutomationSettings.id, set: { ...input.settings, updatedByAdminId: input.adminId, updatedAt: new Date() } });
    await tx.insert(adminActivityLogs).values({ ...input.activityLog, metadata: input.settings });
  });
}

export async function claimEmailAutomationJob(job: EmailAutomationJobName, now = new Date()) {
  const leaseUntil = new Date(now.getTime() + EMAIL_AUTOMATION_LEASE_MS);
  return db.transaction(async (tx) => {
    const [claimed] = await tx.select({ job: emailAutomationJobs.job })
      .from(emailAutomationJobs)
      .where(and(
        eq(emailAutomationJobs.job, job),
        lte(emailAutomationJobs.nextRunAt, now),
        or(isNull(emailAutomationJobs.leaseUntil), lte(emailAutomationJobs.leaseUntil, now)),
      ))
      .for("update", { skipLocked: true })
      .limit(1);
    if (!claimed) return null;
    await tx.update(emailAutomationJobs).set({ leaseUntil, lastStartedAt: now, updatedAt: now })
      .where(eq(emailAutomationJobs.job, job));
    const [settings] = await tx.select().from(emailAutomationSettings)
      .where(eq(emailAutomationSettings.id, 1)).limit(1);
    return { leaseUntil, settings: settings ?? EMAIL_AUTOMATION_DEFAULTS };
  });
}

export async function finishEmailAutomationJob(input: {
  job: EmailAutomationJobName;
  leaseUntil: Date;
  intervalSeconds: number;
  ok: boolean;
  error?: unknown;
  finishedAt?: Date;
}) {
  const finishedAt = input.finishedAt ?? new Date();
  await db.update(emailAutomationJobs).set({
    leaseUntil: null,
    lastFinishedAt: finishedAt,
    lastStatus: input.ok ? "success" : "failure",
    lastError: input.ok ? null : sanitizeEmailDeliveryError(input.error),
    nextRunAt: new Date(finishedAt.getTime() + (input.ok ? input.intervalSeconds : 60) * 1000),
    updatedAt: finishedAt,
  }).where(and(
    eq(emailAutomationJobs.job, input.job),
    eq(emailAutomationJobs.leaseUntil, input.leaseUntil),
  ));
}
