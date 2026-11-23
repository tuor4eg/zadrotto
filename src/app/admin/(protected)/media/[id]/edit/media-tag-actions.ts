"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";

import { changeAdminMediaItemTag, type AdminMediaTagChange } from "@/db/queries/tags";
import { logActivity } from "@/lib/activity-logs/server";
import { requireAdminUser } from "@/lib/auth/admin-auth";

function validId(id: number) {
  return Number.isInteger(id) && id > 0 && id <= 2147483647;
}

export async function changeMediaTagAction(mediaItemId: number, formData: FormData) {
  const admin = await requireAdminUser();
  const operation = formData.get("operation");
  const title = formData.get("title");
  const tagId = Number(formData.get("tagId"));
  let change: AdminMediaTagChange;
  if (!validId(mediaItemId)) return { error: "Запись недоступна." };
  if (operation === "add" && typeof title === "string") {
    change = { operation, title };
  } else if (operation === "rename" && validId(tagId) && typeof title === "string") {
    change = { operation, tagId, title };
  } else if ((operation === "pin" || operation === "unpin" || operation === "delete" || operation === "attach") && validId(tagId)) {
    change = { operation, tagId };
  } else {
    return { error: "Некорректное действие с тегом." };
  }

  try {
    const result = await changeAdminMediaItemTag(mediaItemId, change);
    if (result.changed) {
      await logActivity({
        action: "media.tags.updated",
        actorType: "admin",
        adminUserId: admin.id,
        entityType: "media-item",
        entityId: mediaItemId,
        entityLabel: result.item.title,
        metadata: { operation, tagId: result.tagId },
      });
      revalidatePath(`/admin/media/${mediaItemId}/edit`);
      revalidatePath("/admin/tags");
      revalidatePath("/admin/tags/[id]/edit", "page");
      revalidatePath(`/media/${result.item.code}`);
      revalidatePath("/archive");
      revalidatePath("/tags");
      revalidatePath("/achievements");
    }
    return { error: null };
  } catch (error) {
    const code = error instanceof Error ? error.message : "";
    if (code === "invalid-tag") return { error: "Проверьте название тега и повторите попытку." };
    if (code === "tag-group-changed") return { error: "Назначения тега изменились. Обновите страницу и повторите попытку." };
    if (code === "editorial-author-missing") return { error: "Не удалось определить редакционный аккаунт." };
    if (code === "tag-shared-title") return { error: "Тег используется в других записях. Выберите другое название." };
    console.error("Ошибка изменения тегов записи", error);
    return { error: "Не удалось изменить тег." };
  }
}

export async function submitMediaTagAction(mediaItemId: number, formData: FormData) {
  const result = await changeMediaTagAction(mediaItemId, formData);
  const params = new URLSearchParams({ tab: "tags" });
  if (result.error) params.set("tagError", "1");
  else params.set("tagSaved", "1");
  redirect(`/admin/media/${mediaItemId}/edit?${params}`);
}
