"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";

import { saveAuthorRegistrationAccessProfile } from "@/db/queries/author-registration-settings";
import { prepareActivityLog } from "@/lib/activity-logs/server";
import { requireAdminUser } from "@/lib/auth/admin-auth";

export async function updateAuthorRegistrationSettingsAction(formData: FormData) {
  const admin = await requireAdminUser();
  const accessProfileId = Number(formData.get("accessProfileId"));

  if (!Number.isInteger(accessProfileId) || accessProfileId <= 0) {
    redirect("/admin/settings/authors?error=invalid-profile");
  }

  const activityLog = await prepareActivityLog({
    action: "author.registration-settings.updated",
    actorType: "admin",
    adminUserId: admin.id,
    entityType: "author-registration-settings",
    entityId: 1,
    entityLabel: "Профиль новых авторов",
    message: "Профиль доступа для новых регистраций изменён.",
  });
  const saved = await saveAuthorRegistrationAccessProfile({
    accessProfileId,
    adminId: admin.id,
    activityLog,
  });
  if (!saved) {
    redirect("/admin/settings/authors?error=invalid-profile");
  }

  revalidatePath("/admin/settings/authors");
  redirect("/admin/settings/authors?updated=1");
}
