"use server";

import { redirect } from "next/navigation";
import { revalidatePath } from "next/cache";
import { requireAdminUser } from "@/lib/auth/admin-auth";
import { saveAnalyticsSettings } from "@/db/queries/analytics-settings";

export async function saveAnalyticsSettingsAction(formData: FormData) {
  await requireAdminUser();
  await saveAnalyticsSettings(formData.get("enabled") === "on");
  revalidatePath("/admin/tools/statistics");
  redirect("/admin/tools/statistics?saved=1");
}
