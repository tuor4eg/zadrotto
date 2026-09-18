"use server"

import { revalidatePath } from "next/cache"
import { redirect } from "next/navigation"

import {
  getAchievementSettings,
  updateAchievementSettings,
} from "@/db/queries/achievement-settings"
import { logActivity } from "@/lib/activity-logs/server"
import {
  deleteAchievementImageBestEffort,
  uploadDefaultShowcaseBackgroundImage,
  uploadLockedAchievementImage,
} from "@/lib/achievements/images"
import { requireAdminUser } from "@/lib/auth/admin-auth"

function settingsPath(suffix = "") {
  return `/admin/settings/achievements${suffix}`
}

function revalidateAchievementSettingsPaths() {
  revalidatePath("/admin/settings/achievements")
  revalidatePath("/achievements")
  revalidatePath("/author")
  revalidatePath("/users/[id]", "page")
}

function readOptionalFile(formData: FormData, name: string) {
  const value = formData.get(name)
  return value instanceof File && value.size > 0 ? value : null
}

export async function updateAchievementSettingsAction(formData: FormData) {
  const admin = await requireAdminUser()
  const settings = await getAchievementSettings()

  const removeLockedImage = formData.get("removeImage") === "1"
  const removeDefaultShowcaseBackground =
    formData.get("removeDefaultShowcaseBackgroundImage") === "1"
  const lockedFile = readOptionalFile(formData, "imageFile")
  const defaultShowcaseBackgroundFile = readOptionalFile(
    formData,
    "defaultShowcaseBackgroundImageFile",
  )

  let nextLockedObjectKey = removeLockedImage ? null : settings.lockedImageObjectKey
  let nextDefaultShowcaseBackgroundObjectKey = removeDefaultShowcaseBackground
    ? null
    : settings.defaultShowcaseBackgroundImageObjectKey
  const uploadedObjectKeys: string[] = []

  if (lockedFile && !removeLockedImage) {
    const uploaded = await uploadLockedAchievementImage(lockedFile)
    if (!uploaded.ok) redirect(settingsPath(`?error=${uploaded.error}`))
    nextLockedObjectKey = uploaded.objectKey
    uploadedObjectKeys.push(uploaded.objectKey)
  }

  if (defaultShowcaseBackgroundFile && !removeDefaultShowcaseBackground) {
    const uploaded = await uploadDefaultShowcaseBackgroundImage(defaultShowcaseBackgroundFile)
    if (!uploaded.ok) {
      await Promise.all(uploadedObjectKeys.map((objectKey) => deleteAchievementImageBestEffort(objectKey)))
      redirect(settingsPath(`?error=${uploaded.error}`))
    }
    nextDefaultShowcaseBackgroundObjectKey = uploaded.objectKey
    uploadedObjectKeys.push(uploaded.objectKey)
  }

  try {
    await updateAchievementSettings({
      defaultShowcaseBackgroundImageObjectKey: nextDefaultShowcaseBackgroundObjectKey,
      lockedImageObjectKey: nextLockedObjectKey,
      updatedByAdminId: admin.id,
    })
  } catch (error) {
    await Promise.all(uploadedObjectKeys.map((objectKey) => deleteAchievementImageBestEffort(objectKey)))
    console.error("Не удалось сохранить настройки ачивок.", error)
    redirect(settingsPath("?error=save"))
  }

  const lockedChanged = settings.lockedImageObjectKey !== nextLockedObjectKey
  const defaultShowcaseChanged =
    settings.defaultShowcaseBackgroundImageObjectKey !== nextDefaultShowcaseBackgroundObjectKey

  if (lockedChanged) {
    await deleteAchievementImageBestEffort(settings.lockedImageObjectKey)
  }
  if (defaultShowcaseChanged) {
    await deleteAchievementImageBestEffort(settings.defaultShowcaseBackgroundImageObjectKey)
  }

  if (lockedChanged || defaultShowcaseChanged) {
    await logActivity({
      action: "achievement-settings.updated",
      actorType: "admin",
      adminUserId: admin.id,
      entityType: "achievement-settings",
      entityId: 1,
      entityLabel: "Настройки ачивок",
      message: "Настройки оформления витрины ачивок изменены.",
      metadata: {
        hasDefaultShowcaseBackground: Boolean(nextDefaultShowcaseBackgroundObjectKey),
        hasLockedImage: Boolean(nextLockedObjectKey),
      },
    })
  }

  revalidateAchievementSettingsPaths()
  redirect(settingsPath("?updated=1"))
}
