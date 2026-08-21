"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";

import {
  MAX_TOAST_DURATION_SECONDS,
  MIN_TOAST_DURATION_SECONDS,
  saveToastSettings,
} from "@/db/queries/toast-settings";
import { logActivity } from "@/lib/activity-logs/server";
import { requireAdminUser } from "@/lib/auth/admin-auth";

const SETTINGS_PATH = "/admin/settings/notifications";

function readDuration(formData: FormData, name: string) {
  const value = Number(formData.get(name));
  return Number.isInteger(value) && value >= MIN_TOAST_DURATION_SECONDS && value <= MAX_TOAST_DURATION_SECONDS
    ? value
    : null;
}

export async function updateToastSettingsAction(formData: FormData) {
  const admin = await requireAdminUser();
  const siteDurationSeconds = readDuration(formData, "siteDurationSeconds");
  const adminDurationSeconds = readDuration(formData, "adminDurationSeconds");

  if (siteDurationSeconds === null || adminDurationSeconds === null) {
    redirect(`${SETTINGS_PATH}?error=invalid-duration`);
  }

  await saveToastSettings({ siteDurationSeconds, adminDurationSeconds, updatedByAdminId: admin.id });
  await logActivity({
    action: "toast-settings.updated",
    actorType: "admin",
    adminUserId: admin.id,
    entityType: "toast-settings",
    entityId: 1,
    entityLabel: "Настройки уведомлений",
    message: "Время показа тостов изменено.",
    metadata: { siteDurationSeconds, adminDurationSeconds },
  });

  revalidatePath("/", "layout");
  redirect(`${SETTINGS_PATH}?updated=1`);
}
