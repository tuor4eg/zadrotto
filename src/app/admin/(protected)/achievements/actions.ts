"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";

import {
  getAdminAchievementById,
  updateAchievementPresentation,
} from "@/db/queries/achievements";
import { logActivity } from "@/lib/activity-logs/server";
import {
  deleteAchievementImageBestEffort,
  uploadAchievementImage,
} from "@/lib/achievements/images";
import { requireAdminUser } from "@/lib/auth/admin-auth";

function editPath(id: number, suffix = "") {
  return `/admin/achievements/${id}/edit${suffix}`;
}

export async function updateAchievementAction(formData: FormData) {
  const admin = await requireAdminUser();
  const id = Number(formData.get("achievementId"));
  if (!Number.isSafeInteger(id) || id <= 0) redirect("/admin/achievements?error=invalid");

  const achievement = await getAdminAchievementById(id);
  if (!achievement) redirect("/admin/achievements?error=missing");

  const name = String(formData.get("name") ?? "").trim();
  const description = String(formData.get("description") ?? "").trim();
  if (!name || !description) {
    redirect(editPath(id, "?error=invalid"));
  }

  const removeImage = formData.get("removeImage") === "1";
  const fileValue = formData.get("imageFile");
  const file = fileValue instanceof File && fileValue.size > 0 ? fileValue : null;
  let uploadedObjectKey: string | null = null;

  if (file && !removeImage) {
    const uploaded = await uploadAchievementImage({ achievementId: id, file });
    if (!uploaded.ok) redirect(editPath(id, `?error=${uploaded.error}`));
    uploadedObjectKey = uploaded.objectKey;
  }

  const nextImageObjectKey = removeImage
    ? null
    : uploadedObjectKey ?? achievement.imageObjectKey;

  let updated;
  try {
    updated = await updateAchievementPresentation({
      description,
      enabled: formData.get("enabled") === "1",
      id,
      imageObjectKey: nextImageObjectKey,
      name,
      showWhenLocked: formData.get("showWhenLocked") === "1",
    });
  } catch (error) {
    await deleteAchievementImageBestEffort(uploadedObjectKey);
    console.error("Не удалось сохранить ачивку.", error);
    redirect(editPath(id, "?error=save"));
  }

  if (!updated) {
    await deleteAchievementImageBestEffort(uploadedObjectKey);
    redirect("/admin/achievements?error=missing");
  }

  if (achievement.imageObjectKey !== nextImageObjectKey) {
    await deleteAchievementImageBestEffort(achievement.imageObjectKey);
  }

  await logActivity({
    action: "achievement.updated",
    actorType: "admin",
    adminUserId: admin.id,
    entityType: "achievement",
    entityId: achievement.id,
    entityLabel: name,
    message: "Оформление ачивки изменено.",
    metadata: {
      code: achievement.code,
      enabled: updated.enabled,
      hasImage: Boolean(updated.imageObjectKey),
      showWhenLocked: updated.showWhenLocked,
    },
  });

  revalidatePath("/author");
  revalidatePath("/users/[id]", "page");
  revalidatePath("/admin/achievements");
  redirect(editPath(id, "?updated=1"));
}
