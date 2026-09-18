import { eq } from "drizzle-orm"

import { db } from "@/db"
import { achievementSettings } from "@/db/schema"
import {
  isAchievementImageObjectKey,
  resolveAchievementImageUrl,
} from "@/lib/achievements/images"

const ACHIEVEMENT_SETTINGS_ID = 1

export type AchievementSettingsValue = {
  defaultShowcaseBackgroundImageObjectKey: string | null
  defaultShowcaseBackgroundImageUrl: string | null
  lockedImageObjectKey: string | null
  lockedImageUrl: string | null
}

export async function getAchievementSettings(): Promise<AchievementSettingsValue> {
  const [settings] = await db
    .select({
      defaultShowcaseBackgroundImageObjectKey:
        achievementSettings.defaultShowcaseBackgroundImageObjectKey,
      lockedImageObjectKey: achievementSettings.lockedImageObjectKey,
    })
    .from(achievementSettings)
    .where(eq(achievementSettings.id, ACHIEVEMENT_SETTINGS_ID))
    .limit(1)

  return {
    defaultShowcaseBackgroundImageObjectKey:
      settings?.defaultShowcaseBackgroundImageObjectKey ?? null,
    defaultShowcaseBackgroundImageUrl: resolveAchievementImageUrl(
      settings?.defaultShowcaseBackgroundImageObjectKey ?? null,
    ),
    lockedImageObjectKey: settings?.lockedImageObjectKey ?? null,
    lockedImageUrl: resolveAchievementImageUrl(settings?.lockedImageObjectKey ?? null),
  }
}

export async function updateAchievementSettings(input: {
  defaultShowcaseBackgroundImageObjectKey: string | null
  lockedImageObjectKey: string | null
  updatedByAdminId: number
}) {
  if (input.lockedImageObjectKey && !isAchievementImageObjectKey(input.lockedImageObjectKey)) {
    throw new Error("invalid")
  }
  if (
    input.defaultShowcaseBackgroundImageObjectKey
    && !isAchievementImageObjectKey(input.defaultShowcaseBackgroundImageObjectKey)
  ) {
    throw new Error("invalid")
  }

  const [settings] = await db
    .insert(achievementSettings)
    .values({
      id: ACHIEVEMENT_SETTINGS_ID,
      defaultShowcaseBackgroundImageObjectKey: input.defaultShowcaseBackgroundImageObjectKey,
      lockedImageObjectKey: input.lockedImageObjectKey,
      updatedByAdminId: input.updatedByAdminId,
    })
    .onConflictDoUpdate({
      target: achievementSettings.id,
      set: {
        defaultShowcaseBackgroundImageObjectKey: input.defaultShowcaseBackgroundImageObjectKey,
        lockedImageObjectKey: input.lockedImageObjectKey,
        updatedByAdminId: input.updatedByAdminId,
        updatedAt: new Date(),
      },
    })
    .returning({
      defaultShowcaseBackgroundImageObjectKey:
        achievementSettings.defaultShowcaseBackgroundImageObjectKey,
      lockedImageObjectKey: achievementSettings.lockedImageObjectKey,
    })

  return settings
}
