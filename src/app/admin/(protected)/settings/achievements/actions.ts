"use server"

import { revalidatePath } from "next/cache"
import { redirect } from "next/navigation"

import {
  getAchievementSettings,
  updateAchievementLockedImage,
} from "@/db/queries/achievement-settings"
import { logActivity } from "@/lib/activity-logs/server"
import {
  deleteAchievementImageBestEffort,
  uploadLockedAchievementImage,
} from "@/lib/achievements/images"
import { requireAdminUser } from "@/lib/auth/admin-auth"

function settingsPath(suffix = "") {
  return `/admin/settings/achievements${suffix}`
}

function revalidateAchievementSettingsPaths() {
  revalidatePath("/admin/settings/achievements")
  revalidatePath("/author")
  revalidatePath("/users/[id]", "page")
}

export async function updateAchievementSettingsAction(formData: FormData) {
  const admin = await requireAdminUser()
  const settings = await getAchievementSettings()
  const removeImage = formData.get("removeImage") === "1"
  const fileValue = formData.get("imageFile")
  const file = fileValue instanceof File && fileValue.size > 0 ? fileValue : null

  let nextObjectKey = removeImage ? null : settings.lockedImageObjectKey
  let uploadedObjectKey: string | null = null

  if (file && !removeImage) {
    const uploaded = await uploadLockedAchievementImage(file)
    if (!uploaded.ok) redirect(settingsPath(`?error=${uploaded.error}`))
    nextObjectKey = uploaded.objectKey
    uploadedObjectKey = uploaded.objectKey
  }

  try {
    await updateAchievementLockedImage({
      lockedImageObjectKey: nextObjectKey,
      updatedByAdminId: admin.id,
    })
  } catch (error) {
    await deleteAchievementImageBestEffort(uploadedObjectKey)
    console.error("Не удалось сохранить настройки ачивок.", error)
    redirect(settingsPath("?error=save"))
  }

  if (settings.lockedImageObjectKey !== nextObjectKey) {
    await deleteAchievementImageBestEffort(settings.lockedImageObjectKey)
    await logActivity({
      action: "achievement-settings.updated",
      actorType: "admin",
      adminUserId: admin.id,
      entityType: "achievement-settings",
      entityId: 1,
      entityLabel: "Настройки ачивок",
      message: "Изображение для неполученной ачивки изменено.",
      metadata: { hasLockedImage: Boolean(nextObjectKey) },
    })
  }

  revalidateAchievementSettingsPaths()
  redirect(settingsPath("?updated=1"))
}
