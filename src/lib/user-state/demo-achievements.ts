import type { AchievementShowcaseItem } from "@/components/achievements/achievement-card"

export type DemoAchievementCatalogLevel = {
  description: string | null
  imageUrl: string | null
  level: number
  name: string
  threshold: number
}

export type DemoAchievementCatalogItem = {
  code: string
  description: string | null
  levels: DemoAchievementCatalogLevel[]
  name: string
}

export type DemoEarnedAchievementLevel = {
  code: string
  imageUrl: string | null
  key: string
  level: number
  name: string
  threshold: number
}

export function demoAchievementLevelKey(code: string, level: number) {
  return `${code}:${level}`
}

export function getDemoAchievementProgressValue(
  valuesByCode: Record<string, number>,
  code: string,
) {
  return valuesByCode[code] ?? 0
}

export function listEarnedDemoAchievementLevels(
  catalog: DemoAchievementCatalogItem[],
  valuesByCode: Record<string, number>,
): DemoEarnedAchievementLevel[] {
  return catalog.flatMap((achievement) => {
    const currentValue = getDemoAchievementProgressValue(valuesByCode, achievement.code)
    return achievement.levels
      .filter((level) => currentValue >= level.threshold)
      .map((level) => ({
        code: achievement.code,
        imageUrl: level.imageUrl,
        key: demoAchievementLevelKey(achievement.code, level.level),
        level: level.level,
        name: level.name,
        threshold: level.threshold,
      }))
  })
}

export function claimNewlyEarnedDemoAchievements(input: {
  announcedKeys: readonly string[]
  catalog: DemoAchievementCatalogItem[]
  seeded: boolean
  valuesByCode: Record<string, number>
}) {
  const earned = listEarnedDemoAchievementLevels(input.catalog, input.valuesByCode)
  const earnedKeys = earned.map((item) => item.key)

  if (!input.seeded) {
    return {
      announcedKeys: earnedKeys,
      newlyEarned: [] as DemoEarnedAchievementLevel[],
      seeded: true,
    }
  }

  const announced = new Set(input.announcedKeys)
  const newlyEarned = earned.filter((item) => !announced.has(item.key))
  return {
    announcedKeys: [...new Set([...input.announcedKeys, ...earnedKeys])],
    newlyEarned,
    seeded: true,
  }
}

export function buildDemoAchievementShowcaseItems(
  catalog: DemoAchievementCatalogItem[],
  valuesByCode: Record<string, number>,
  awardedAt: string,
): AchievementShowcaseItem[] {
  return catalog.map((achievement) => {
    const currentValue = getDemoAchievementProgressValue(valuesByCode, achievement.code)
    const awardedLevels = achievement.levels
      .filter((level) => currentValue >= level.threshold)
      .map((level) => ({
        awardedAt,
        description: level.description,
        imageUrl: level.imageUrl,
        level: level.level,
        name: level.name,
      }))

    const highest = awardedLevels[awardedLevels.length - 1] ?? null
    const nextLevel = achievement.levels.find((level) => currentValue < level.threshold) ?? null
    const lockedPresentation = achievement.levels[0] ?? null

    return {
      awardedAt: highest?.awardedAt ?? null,
      awardedLevels,
      code: achievement.code,
      currentValue,
      description: highest?.description
        ?? nextLevel?.description
        ?? lockedPresentation?.description
        ?? achievement.description,
      highestAwardedLevel: highest?.level ?? null,
      imageUrl: highest?.imageUrl ?? null,
      levelCount: achievement.levels.length,
      name: highest?.name
        ?? nextLevel?.name
        ?? lockedPresentation?.name
        ?? achievement.name,
      nextLevel: nextLevel?.level ?? null,
      nextThreshold: nextLevel?.threshold ?? null,
    }
  })
}
