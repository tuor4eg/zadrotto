"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";

import {
  AdminBugReportCreationError,
  BugReportTransitionError,
  createAdminBugReport,
  searchManualBugReportAuthors,
  transitionBugReportStatus,
} from "@/db/queries/bug-reports";
import { prepareActivityLog } from "@/lib/activity-logs/server";
import { requireAdminUser } from "@/lib/auth/admin-auth";
import {
  BUG_REPORT_DESCRIPTION_MAX_LENGTH,
  isBugReportStatus,
  normalizeBugReportRelativeUrl,
} from "@/lib/bug-reports/model";

export async function searchManualBugReportAuthorsAction(query: string) {
  await requireAdminUser();
  return searchManualBugReportAuthors(query);
}

export async function createAdminBugReportAction(formData: FormData) {
  const admin = await requireAdminUser();
  const authorId = Number(formData.get("authorId"));
  const description = String(formData.get("description") ?? "").trim();
  const initialStatus = String(formData.get("initialStatus") ?? "");
  const url = normalizeBugReportRelativeUrl(String(formData.get("url") ?? ""));

  if (
    !Number.isInteger(authorId)
    || authorId <= 0
    || !description
    || description.length > BUG_REPORT_DESCRIPTION_MAX_LENGTH
    || (initialStatus !== "new" && initialStatus !== "confirmed")
    || !url
  ) {
    redirect("/admin/bug-reports/new?error=invalid");
  }

  let report: { id: number };
  try {
    const activityLog = await prepareActivityLog({
      action: "bug-report.created",
      actorType: "admin",
      adminUserId: admin.id,
      entityType: "bug-report",
    });
    report = await createAdminBugReport({
      activityLog,
      authorId,
      description,
      initialStatus,
      url,
    });
  } catch (error) {
    const code = error instanceof AdminBugReportCreationError ? error.code : "save";
    console.error("Не удалось создать багрепорт вручную.", error);
    redirect(`/admin/bug-reports/new?error=${encodeURIComponent(code)}`);
  }

  revalidatePath("/admin/bug-reports");
  revalidatePath("/admin", "layout");
  redirect(`/admin/bug-reports/${report.id}?created=1`);
}

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
