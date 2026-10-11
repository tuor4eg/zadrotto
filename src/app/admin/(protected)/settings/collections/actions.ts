"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { saveCollectionSettings } from "@/db/queries/collection-settings";
import { requireAdminUser } from "@/lib/auth/admin-auth";
import { logActivity } from "@/lib/activity-logs/server";
import { parseCollectionSettings } from "@/lib/editorial-documents/settings";

export async function updateCollectionSettingsAction(form: FormData) {
  const admin = await requireAdminUser();
  const limits = parseCollectionSettings({ maxBlocks: form.get("maxBlocks"), maxEntries: form.get("maxEntries") });
  if (!limits) redirect("/admin/settings/collections?error=invalid");
  await saveCollectionSettings({ ...limits, updatedByAdminId: admin.id });
  await logActivity({ action: "collection-settings.updated", actorType: "admin", adminUserId: admin.id, entityType: "collection-settings", entityId: 1, entityLabel: "Настройки подборок", message: "Лимиты подборок изменены.", metadata: limits });
  revalidatePath("/admin/settings/collections");
  revalidatePath("/admin/collections", "layout");
  redirect("/admin/settings/collections?updated=1");
}
