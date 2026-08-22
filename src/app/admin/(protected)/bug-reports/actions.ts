"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";

import {
  BugReportTransitionError,
  transitionBugReportStatus,
} from "@/db/queries/bug-reports";
import { prepareActivityLog } from "@/lib/activity-logs/server";
import { requireAdminUser } from "@/lib/auth/admin-auth";
import { isBugReportStatus } from "@/lib/bug-reports/model";

export async function transitionBugReportAction(formData: FormData) {
  const admin = await requireAdminUser();
  const id = Number(formData.get("id"));
  const expectedStatus = String(formData.get("expectedStatus") ?? "");
  const status = String(formData.get("status") ?? "");

  if (!Number.isInteger(id) || id <= 0 || !isBugReportStatus(expectedStatus) || !isBugReportStatus(status)) {
    redirect("/admin/bug-reports?error=invalid");
  }

  try {
    const activityLog = await prepareActivityLog({
      action: `bug-report.${status}`,
      actorType: "admin",
      adminUserId: admin.id,
      entityType: "bug-report",
      entityId: id,
    });
    await transitionBugReportStatus({
      activityLog,
      adminId: admin.id,
      expectedStatus,
      id,
      status,
    });
  } catch (error) {
    const code = error instanceof BugReportTransitionError ? error.code : "save";
    console.error("Не удалось изменить статус багрепорта.", error);
    redirect(`/admin/bug-reports/${id}?error=${encodeURIComponent(code)}`);
  }

  revalidatePath("/admin/bug-reports");
  revalidatePath(`/admin/bug-reports/${id}`);
  revalidatePath("/admin", "layout");
  redirect(`/admin/bug-reports/${id}?updated=1`);
}
