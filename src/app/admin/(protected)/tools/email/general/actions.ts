"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { saveEmailAutomationSettings } from "@/db/queries/email-automation";
import { prepareActivityLog } from "@/lib/activity-logs/server";
import { requireAdminUser } from "@/lib/auth/admin-auth";
import { validateEmailAutomationSettings } from "@/lib/auth/email-automation";

export async function saveEmailAutomationSettingsAction(formData: FormData) {
  const admin = await requireAdminUser();
  const values = Object.fromEntries(formData.entries());
  const settings = validateEmailAutomationSettings(values);
  if (!settings) redirect("/admin/tools/email/general?error=invalid");
  const activityLog = await prepareActivityLog({ action: "email-automation.updated", actorType: "admin", adminUserId: admin.id, entityType: "email-automation", entityId: 1, entityLabel: "Общие настройки", message: "Настройки автоматизации email изменены.", metadata: settings });
  await saveEmailAutomationSettings({ settings, adminId: admin.id, activityLog });
  revalidatePath("/admin/tools/email/general");
  redirect("/admin/tools/email/general?updated=1");
}
