"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";

import { enqueueEditorialSummaryRun, getEditorialSummarySource, saveManualEditorialSummary, setEditorialSummaryLocked } from "@/db/queries/editorial-summaries";
import { logActivity } from "@/lib/activity-logs/server";
import { requireAdminUser } from "@/lib/auth/admin-auth";

function readId(formData: FormData) {
  const id = Number(formData.get("mediaItemId"));
  if (!Number.isSafeInteger(id) || id < 1) throw new Error("INVALID_MEDIA_ITEM_ID");
  return id;
}

function path(id: number) { return `/admin/media/${id}/edit`; }

export async function generateEditorialSummaryAction(formData: FormData) {
  const admin = await requireAdminUser();
  const mediaItemId = readId(formData);
  const item = await getEditorialSummarySource(mediaItemId);
  if (!item || item.locked) redirect(`${path(mediaItemId)}?summaryError=locked`);
  try {
    const result = await enqueueEditorialSummaryRun({ mediaItemId, source: "manual", createdByAdminId: admin.id, force: true });
    if (result.created) await logActivity({ action: "media.editorial-summary-requested", actorType: "admin", adminUserId: admin.id, entityType: "media-item", entityId: mediaItemId, entityLabel: item.title, message: "Генерация справки поставлена в очередь." });
  } catch { redirect(`${path(mediaItemId)}?summaryError=enqueue`); }
  revalidatePath(path(mediaItemId));
  redirect(`${path(mediaItemId)}?summaryQueued=1`);
}

export async function saveEditorialSummaryAction(formData: FormData) {
  const admin = await requireAdminUser();
  const mediaItemId = readId(formData);
  const text = String(formData.get("summary") ?? "").trim();
  if (!text || text.length > 400) redirect(`${path(mediaItemId)}?summaryError=invalid`);
  const item = await getEditorialSummarySource(mediaItemId);
  if (!item) redirect(`${path(mediaItemId)}?summaryError=missing`);
  await saveManualEditorialSummary(mediaItemId, text);
  await logActivity({ action: "media.editorial-summary-edited", actorType: "admin", adminUserId: admin.id, entityType: "media-item", entityId: mediaItemId, entityLabel: item.title, message: "Редакционная справка изменена и защищена от автозамены." });
  revalidatePath(path(mediaItemId));
  redirect(`${path(mediaItemId)}?summarySaved=1`);
}

export async function setEditorialSummaryLockAction(formData: FormData) {
  const admin = await requireAdminUser();
  const mediaItemId = readId(formData);
  const item = await getEditorialSummarySource(mediaItemId);
  if (!item || !item.status) redirect(`${path(mediaItemId)}?summaryError=missing`);
  const locked = formData.get("locked") === "true";
  await setEditorialSummaryLocked(mediaItemId, locked);
  await logActivity({ action: "media.editorial-summary-lock-changed", actorType: "admin", adminUserId: admin.id, entityType: "media-item", entityId: mediaItemId, entityLabel: item.title, message: locked ? "Справка защищена от автозамены." : "Автозамена справки разрешена." });
  revalidatePath(path(mediaItemId));
  redirect(path(mediaItemId));
}
