"use server";

import { redirect } from "next/navigation";

import { createAdminExport, createDatabaseDumpExport, retryAdminExport } from "@/lib/admin-exports/create";
import { cancelQueuedAdminExport } from "@/db/queries/admin-exports";
import { ADMIN_EXPORT_ENTITY_TYPES } from "@/lib/admin-exports/model";
import { requireAdminUser } from "@/lib/auth/admin-auth";
import { logActivity } from "@/lib/activity-logs/server";
import { getDatabaseDumpCreationErrorCode } from "@/lib/admin-exports/errors";

export async function createDatabaseDumpAction() {
  const admin = await requireAdminUser();
  try {
    const item = await createDatabaseDumpExport(admin.id);
    await logActivity({ action: "data-export.created", actorType: "admin", adminUserId: admin.id, entityType: "data-export", entityLabel: item.id, message: "Запрошено создание полного дампа базы." });
  } catch (error) {
    const code = getDatabaseDumpCreationErrorCode(error);
    console.error("Database dump request failed", { code });
    redirect(`/admin/exports?error=${code}`);
  }
  redirect("/admin/exports?created=1");
}

export async function createAdminExportAction(formData: FormData) {
  const admin = await requireAdminUser();
  const entityType = String(formData.get("entityType") ?? "");
  if (!ADMIN_EXPORT_ENTITY_TYPES.includes(entityType as "media_items" | "series")) {
    redirect("/admin/exports?error=invalid");
  }

  try {
    const created = await createAdminExport({
      adminId: admin.id,
      entityType: entityType as "media_items" | "series",
      fields: formData.getAll("fields"),
      filters: JSON.parse(String(formData.get("filters") ?? "{}")),
      sort: String(formData.get("sort") ?? "title"),
    });
    await logActivity({ action: "data-export.created", actorType: "admin", adminUserId: admin.id, entityType: "data-export", entityLabel: created.id, message: "Экспорт данных поставлен в очередь." });
  } catch (error) {
    console.error(error);
    redirect("/admin/exports?error=create");
  }
  redirect("/admin/exports?created=1");
}

export async function retryAdminExportAction(formData: FormData) {
  const admin = await requireAdminUser();
  try {
    const retried = await retryAdminExport({ adminId: admin.id, exportId: String(formData.get("exportId") ?? "") });
    await logActivity({ action: "data-export.retry-requested", actorType: "admin", adminUserId: admin.id, entityType: "data-export", entityLabel: retried.id, message: "Запрошен повтор экспорта данных." });
  } catch (error) {
    console.error(error);
    redirect("/admin/exports?error=retry");
  }
  redirect("/admin/exports?retried=1");
}

export async function cancelAdminExportAction(formData: FormData) {
  const admin = await requireAdminUser();
  const cancelled = await cancelQueuedAdminExport(String(formData.get("exportId") ?? ""), admin.id);
  if (!cancelled) redirect("/admin/exports?error=cancel");
  await logActivity({ action: "data-export.cancelled", actorType: "admin", adminUserId: admin.id, entityType: "data-export", entityLabel: cancelled.id, message: "Экспорт данных отменён." });
  redirect("/admin/exports?cancelled=1");
}
