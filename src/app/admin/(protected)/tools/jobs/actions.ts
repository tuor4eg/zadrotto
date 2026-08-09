"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { cancelQueuedJobRun, retryFailedJobRun, setPeriodicJobEnabled } from "@/db/queries/jobs";
import { logActivity } from "@/lib/activity-logs/server";
import { requireAdminUser } from "@/lib/auth/admin-auth";
import { createManagedPeriodicJob, updateManagedPeriodicJob } from "@/lib/jobs/manage";
import { enqueueJobRun, enqueueManualJobRun } from "@/lib/jobs/queue";
import { DEFAULT_JOB_HISTORY_RETENTION_DAYS } from "@/lib/jobs/model";

const PATH = "/admin/tools/jobs/schedules";
const integer = (value: FormDataEntryValue | null, fallback: number) => Number.isInteger(Number(value)) && Number(value) > 0 ? Number(value) : fallback;
const id = (value: FormDataEntryValue | null) => Number(value);
const returnPath = (value: FormDataEntryValue | null) => {
  const path = typeof value === "string" ? value : "";
  return path.startsWith("/admin/tools/jobs/") ? path : PATH;
};

export async function createJobAction(formData: FormData) {
  const admin = await requireAdminUser();
  try {
    const job = await createManagedPeriodicJob({ code: String(formData.get("code") ?? ""), cronExpression: String(formData.get("cronExpression") ?? ""), historyRetentionDays: integer(formData.get("historyRetentionDays"), DEFAULT_JOB_HISTORY_RETENTION_DAYS), payload: JSON.parse(String(formData.get("payload") ?? "{}")), policy: { maxAttempts: integer(formData.get("maxAttempts"), 3), retryBaseSeconds: integer(formData.get("retryBaseSeconds"), 60), retryMaxSeconds: integer(formData.get("retryMaxSeconds"), 3600), timeoutSeconds: integer(formData.get("timeoutSeconds"), 300) }, type: String(formData.get("type") ?? "") });
    await logActivity({ action: "job.created", actorType: "admin", adminUserId: admin.id, entityType: "job", entityId: job.id, entityLabel: job.code, message: "Фоновая задача создана." });
  } catch { redirect(`${PATH}?error=create`); }
  revalidatePath(PATH); redirect(`${PATH}?created=1`);
}

export async function setJobEnabledAction(formData: FormData) {
  const admin = await requireAdminUser(); const jobId = id(formData.get("id")); const enabled = formData.get("enabled") === "true";
  if (!Number.isInteger(jobId) || jobId <= 0) redirect(`${PATH}?error=invalid`);
  const job = await setPeriodicJobEnabled(jobId, enabled); if (!job) redirect(`${PATH}?error=missing`);
  await logActivity({ action: enabled ? "job.enabled" : "job.disabled", actorType: "admin", adminUserId: admin.id, entityType: "job", entityId: job.id, entityLabel: job.code, message: enabled ? "Фоновая задача включена." : "Фоновая задача выключена." });
  revalidatePath(PATH); redirect(PATH);
}

export async function updateJobAction(formData: FormData) {
  const admin = await requireAdminUser(); const jobId = id(formData.get("id"));
  if (!Number.isInteger(jobId) || jobId <= 0) redirect(`${PATH}?error=invalid`);
  try {
    const job = await updateManagedPeriodicJob(jobId, { code: String(formData.get("code") ?? ""), cronExpression: String(formData.get("cronExpression") ?? ""), enabled: formData.get("enabled") === "true", historyRetentionDays: integer(formData.get("historyRetentionDays"), DEFAULT_JOB_HISTORY_RETENTION_DAYS), payload: JSON.parse(String(formData.get("payload") ?? "{}")), policy: { maxAttempts: integer(formData.get("maxAttempts"), 3), retryBaseSeconds: integer(formData.get("retryBaseSeconds"), 60), retryMaxSeconds: integer(formData.get("retryMaxSeconds"), 3600), timeoutSeconds: integer(formData.get("timeoutSeconds"), 300) }, type: String(formData.get("type") ?? "") });
    if (!job) redirect(`${PATH}?error=missing`);
    await logActivity({ action: "job.updated", actorType: "admin", adminUserId: admin.id, entityType: "job", entityId: job.id, entityLabel: job.code, message: "Фоновая задача изменена." });
  } catch { redirect(`${PATH}?error=update`); }
  revalidatePath(PATH); redirect(PATH);
}

export async function runJobNowAction(formData: FormData) {
  const admin = await requireAdminUser(); const jobId = id(formData.get("id")); if (!Number.isInteger(jobId) || jobId <= 0) redirect(`${PATH}?error=invalid`);
  const run = await enqueueManualJobRun(jobId, admin.id); await logActivity({ action: "job-run.manual-requested", actorType: "admin", adminUserId: admin.id, entityType: "job-run", entityId: run.id, entityLabel: run.type, message: "Ручной запуск фоновой задачи поставлен в очередь." });
  revalidatePath(PATH); redirect(PATH);
}

export async function enqueueAdHocJobAction(formData: FormData) {
  const admin = await requireAdminUser();
  try { const run = await enqueueJobRun({ createdByAdminId: admin.id, payload: JSON.parse(String(formData.get("payload") ?? "{}")), source: "manual", type: String(formData.get("type") ?? "") }); await logActivity({ action: "job-run.manual-requested", actorType: "admin", adminUserId: admin.id, entityType: "job-run", entityId: run.id, entityLabel: run.type, message: "Разовый запуск поставлен в очередь." }); } catch { redirect(`${PATH}?error=enqueue`); }
  revalidatePath(PATH); redirect(PATH);
}

export async function retryJobRunAction(formData: FormData) { const admin = await requireAdminUser(); const runId = id(formData.get("id")); const destination = returnPath(formData.get("returnTo")); const run = await retryFailedJobRun(runId, admin.id); if (run) await logActivity({ action: "job-run.retry-requested", actorType: "admin", adminUserId: admin.id, entityType: "job-run", entityId: run.id, entityLabel: run.type, message: "Повторный запуск поставлен в очередь." }); revalidatePath(destination); redirect(destination); }
export async function cancelJobRunAction(formData: FormData) { const admin = await requireAdminUser(); const runId = id(formData.get("id")); const destination = returnPath(formData.get("returnTo")); const run = await cancelQueuedJobRun(runId); if (run) await logActivity({ action: "job-run.cancelled", actorType: "admin", adminUserId: admin.id, entityType: "job-run", entityId: run.id, entityLabel: run.type, message: "Запуск фоновой задачи отменён." }); revalidatePath(destination); redirect(destination); }
