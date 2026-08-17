"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";

import {
  createAchievementLevel,
  createAchievementWithFirstLevel,
  deleteAchievementLevel,
  getAdminAchievementById,
  updateAchievementGeneral,
  updateAchievementLevel,
} from "@/db/queries/achievements";
import { logActivity } from "@/lib/activity-logs/server";
import {
  deleteAchievementImageBestEffort,
  uploadAchievementImage,
} from "@/lib/achievements/images";
import { requireAdminUser } from "@/lib/auth/admin-auth";
import { getAchievementMechanic } from "@/lib/achievements/catalog";
import { createJobRun } from "@/db/queries/jobs";
import { getAdminFranchiseOptions } from "@/db/queries/franchises";
import { getAdminMediaTypeAccessOptions } from "@/db/queries/media-types";
import {
  DEFAULT_JOB_MAX_ATTEMPTS,
  DEFAULT_JOB_RETRY_BASE_SECONDS,
  DEFAULT_JOB_RETRY_MAX_SECONDS,
  DEFAULT_JOB_TIMEOUT_SECONDS,
} from "@/lib/jobs/model";

async function enqueueAchievementBackfill(achievementId: number, adminUserId: number) {
  await createJobRun({
    createdByAdminId: adminUserId,
    maxAttempts: DEFAULT_JOB_MAX_ATTEMPTS,
    payload: { achievementIds: [achievementId] },
    retryBaseSeconds: DEFAULT_JOB_RETRY_BASE_SECONDS,
    retryMaxSeconds: DEFAULT_JOB_RETRY_MAX_SECONDS,
    source: "manual",
    timeoutSeconds: DEFAULT_JOB_TIMEOUT_SECONDS,
    type: "achievements.backfill",
  });
}

async function parseMechanicParams(formData: FormData, mechanicCode: string) {
  const mechanic = getAchievementMechanic(mechanicCode);
  if (!mechanic) throw new Error("invalid");
  const rawParams: Record<string, unknown> = {};
  for (const parameter of mechanic.params) {
    const raw = String(formData.get(parameter.code) ?? "").trim();
    if (!raw) continue;
    rawParams[parameter.code] = parameter.type === "series" ? Number(raw) : raw;
  }
  const params = mechanic.parseParams(rawParams) as Record<string, unknown>;
  const [mediaTypes, series] = await Promise.all([
    params.mediaType === undefined ? [] : getAdminMediaTypeAccessOptions(),
    params.seriesId === undefined ? [] : getAdminFranchiseOptions(),
  ]);
  if (params.mediaType !== undefined && !mediaTypes.some((item) => item.code === params.mediaType)) throw new Error("invalid");
  if (params.seriesId !== undefined && !series.some((item) => item.id === params.seriesId && item.publicationStatus === "published")) throw new Error("invalid");
  return { mechanic, params };
}

async function parseGeneralConfiguration(formData: FormData) {
  const name = String(formData.get("name") ?? "").trim();
  const description = String(formData.get("description") ?? "").trim();
  const mechanicCode = String(formData.get("mechanic") ?? "");
  if (!name || !description) throw new Error("invalid");
  const { mechanic, params } = await parseMechanicParams(formData, mechanicCode);
  return {
    description,
    enabled: formData.get("enabled") === "1",
    mechanic: mechanic.code,
    name,
    params,
    showWhenLocked: formData.get("showWhenLocked") === "1",
  };
}

function editPath(id: number, suffix = "") {
  return `/admin/achievements/${id}/edit${suffix}`;
}

function levelsPath(id: number, suffix = "") {
  return `/admin/achievements/${id}/edit?tab=levels${suffix}`;
}

function revalidateAchievementPaths() {
  revalidatePath("/author");
  revalidatePath("/users/[id]", "page");
  revalidatePath("/admin/achievements");
}

async function parseLevelPresentation(formData: FormData) {
  const name = String(formData.get("levelName") ?? "").trim();
  const description = String(formData.get("levelDescription") ?? "").trim();
  const threshold = Number(formData.get("threshold"));
  if (!Number.isSafeInteger(threshold) || threshold < 1) throw new Error("invalid");
  return {
    description: description || null,
    name: name || null,
    threshold,
  };
}

async function resolveLevelImageObjectKey(input: {
  achievementId: number;
  currentObjectKey: string | null;
  formData: FormData;
}) {
  const removeImage = input.formData.get("removeImage") === "1";
  const fileValue = input.formData.get("imageFile");
  const file = fileValue instanceof File && fileValue.size > 0 ? fileValue : null;
  if (file && !removeImage) {
    const uploaded = await uploadAchievementImage({ achievementId: input.achievementId, file });
    if (!uploaded.ok) return { error: uploaded.error as string, objectKey: null, uploadedObjectKey: null };
    return { error: null, objectKey: uploaded.objectKey, uploadedObjectKey: uploaded.objectKey };
  }
  return {
    error: null,
    objectKey: removeImage ? null : input.currentObjectKey,
    uploadedObjectKey: null,
  };
}

export async function updateAchievementAction(formData: FormData) {
  const admin = await requireAdminUser();
  const id = Number(formData.get("achievementId"));
  if (!Number.isSafeInteger(id) || id <= 0) redirect("/admin/achievements?error=invalid");

  const achievement = await getAdminAchievementById(id);
  if (!achievement) redirect("/admin/achievements?error=missing");

  let configuration;
  try { configuration = await parseGeneralConfiguration(formData); } catch { redirect(editPath(id, "?error=invalid")); }

  const imageResult = await resolveLevelImageObjectKey({
    achievementId: id,
    currentObjectKey: achievement.imageObjectKey,
    formData,
  });
  if (imageResult.error) redirect(editPath(id, `?error=${imageResult.error}`));

  let updated;
  try {
    updated = await updateAchievementGeneral({
      ...configuration,
      id,
      imageObjectKey: imageResult.objectKey,
    });
  } catch (error) {
    await deleteAchievementImageBestEffort(imageResult.uploadedObjectKey);
    console.error("Не удалось сохранить ачивку.", error);
    redirect(editPath(id, "?error=save"));
  }

  if (!updated) {
    await deleteAchievementImageBestEffort(imageResult.uploadedObjectKey);
    redirect("/admin/achievements?error=missing");
  }

  if (achievement.imageObjectKey !== imageResult.objectKey) {
    await deleteAchievementImageBestEffort(achievement.imageObjectKey);
  }

  await logActivity({
    action: "achievement.updated",
    actorType: "admin",
    adminUserId: admin.id,
    entityType: "achievement",
    entityId: achievement.id,
    entityLabel: configuration.name,
    message: "Ачивка изменена.",
    metadata: {
      code: achievement.code,
      enabled: updated.enabled,
      hasImage: Boolean(updated.imageObjectKey),
      showWhenLocked: updated.showWhenLocked,
    },
  });

  revalidateAchievementPaths();
  redirect(editPath(id, "?updated=1"));
}

export async function createAchievementAction(formData: FormData) {
  const admin = await requireAdminUser();
  const code = String(formData.get("code") ?? "").trim();
  if (!/^[a-z0-9]+(?:-[a-z0-9]+)*$/.test(code)) redirect("/admin/achievements/new?error=invalid");
  let configuration;
  try { configuration = await parseGeneralConfiguration(formData); } catch { redirect("/admin/achievements/new?error=invalid"); }
  const firstLevelThreshold = Number(formData.get("firstLevelThreshold"));
  if (!Number.isSafeInteger(firstLevelThreshold) || firstLevelThreshold < 1) redirect("/admin/achievements/new?error=invalid");
  let achievement
  try {
    achievement = await createAchievementWithFirstLevel({
      ...configuration,
      code,
      firstLevelThreshold,
    })
  } catch (error) {
    console.error("Не удалось создать ачивку.", error)
    redirect("/admin/achievements/new?error=save")
  }
  if (achievement.enabled) await enqueueAchievementBackfill(achievement.id, admin.id)
  await logActivity({
    action: "achievement.updated",
    actorType: "admin",
    adminUserId: admin.id,
    entityType: "achievement",
    entityId: achievement.id,
    entityLabel: achievement.name,
    message: "Ачивка создана.",
    metadata: { code, mechanic: configuration.mechanic },
  })
  revalidateAchievementPaths()
  redirect(levelsPath(achievement.id, "&created=1"))
}

export async function createAchievementLevelAction(formData: FormData) {
  const admin = await requireAdminUser();
  const achievementId = Number(formData.get("achievementId"));
  if (!Number.isSafeInteger(achievementId) || achievementId <= 0) redirect("/admin/achievements?error=invalid");
  const achievement = await getAdminAchievementById(achievementId);
  if (!achievement) redirect("/admin/achievements?error=missing");

  let presentation;
  try { presentation = await parseLevelPresentation(formData); } catch { redirect(levelsPath(achievementId, "&error=invalid")); }

  const imageResult = await resolveLevelImageObjectKey({
    achievementId,
    currentObjectKey: null,
    formData,
  });
  if (imageResult.error) redirect(levelsPath(achievementId, `&error=${imageResult.error}`));

  let created
  try {
    created = await createAchievementLevel({
      achievementId,
      ...presentation,
      imageObjectKey: imageResult.objectKey,
    })
  } catch (error) {
    await deleteAchievementImageBestEffort(imageResult.uploadedObjectKey)
    console.error("Не удалось добавить уровень ачивки.", error)
    redirect(levelsPath(achievementId, "&error=save"))
  }
  if (!created) {
    await deleteAchievementImageBestEffort(imageResult.uploadedObjectKey)
    redirect("/admin/achievements?error=missing")
  }
  if (achievement.enabled) await enqueueAchievementBackfill(achievementId, admin.id)
  revalidateAchievementPaths()
  redirect(levelsPath(achievementId, "&updated=1"))
}

export async function updateAchievementLevelAction(formData: FormData) {
  const admin = await requireAdminUser();
  const achievementId = Number(formData.get("achievementId"));
  const levelId = Number(formData.get("levelId"));
  if (!Number.isSafeInteger(achievementId) || achievementId <= 0 || !Number.isSafeInteger(levelId) || levelId <= 0) {
    redirect("/admin/achievements?error=invalid");
  }
  const achievement = await getAdminAchievementById(achievementId);
  if (!achievement) redirect("/admin/achievements?error=missing");
  const currentLevel = achievement.levels.find((level) => level.id === levelId);
  if (!currentLevel) redirect(levelsPath(achievementId, "&error=invalid"));

  let presentation;
  try { presentation = await parseLevelPresentation(formData); } catch { redirect(levelsPath(achievementId, "&error=invalid")); }

  const imageResult = await resolveLevelImageObjectKey({
    achievementId,
    currentObjectKey: currentLevel.imageObjectKey,
    formData,
  });
  if (imageResult.error) redirect(levelsPath(achievementId, `&error=${imageResult.error}`));

  let updated
  try {
    updated = await updateAchievementLevel({
      achievementId,
      levelId,
      ...presentation,
      imageObjectKey: imageResult.objectKey,
    })
  } catch (error) {
    await deleteAchievementImageBestEffort(imageResult.uploadedObjectKey)
    console.error("Не удалось сохранить уровень ачивки.", error)
    const message = error instanceof Error && error.message === "achievement-level-locked" ? "level-locked" : "save"
    redirect(levelsPath(achievementId, `&error=${message}`))
  }
  if (!updated) {
    await deleteAchievementImageBestEffort(imageResult.uploadedObjectKey)
    redirect(levelsPath(achievementId, "&error=invalid"))
  }
  if (currentLevel.imageObjectKey !== imageResult.objectKey) {
    await deleteAchievementImageBestEffort(currentLevel.imageObjectKey)
  }
  const thresholdChanged = currentLevel.threshold !== presentation.threshold
  if (achievement.enabled && thresholdChanged) await enqueueAchievementBackfill(achievementId, admin.id)
  revalidateAchievementPaths()
  redirect(levelsPath(achievementId, "&updated=1"))
}

export async function deleteAchievementLevelAction(formData: FormData) {
  const achievementId = Number(formData.get("achievementId"));
  const levelId = Number(formData.get("levelId"));
  if (!Number.isSafeInteger(achievementId) || achievementId <= 0 || !Number.isSafeInteger(levelId) || levelId <= 0) {
    redirect("/admin/achievements?error=invalid");
  }
  const achievement = await getAdminAchievementById(achievementId);
  if (!achievement) redirect("/admin/achievements?error=missing");

  let deleted
  try {
    deleted = await deleteAchievementLevel({ achievementId, levelId })
  } catch (error) {
    console.error("Не удалось удалить уровень ачивки.", error)
    const message = error instanceof Error
      ? (error.message === "achievement-level-locked" ? "level-locked"
        : error.message === "achievement-level-last" ? "level-last" : "save")
      : "save"
    redirect(levelsPath(achievementId, `&error=${message}`))
  }
  if (!deleted) redirect(levelsPath(achievementId, "&error=invalid"))
  await deleteAchievementImageBestEffort(deleted.imageObjectKey)
  revalidateAchievementPaths()
  redirect(levelsPath(achievementId, "&updated=1"))
}
