export const ACHIEVEMENT_CARD_IMAGE_PX = 144

export function formatAchievementAwardedAt(value: Date | string) {
  const parts = new Intl.DateTimeFormat("ru-RU", {
    day: "numeric",
    month: "short",
    year: "2-digit",
    timeZone: "Europe/Moscow",
  }).formatToParts(new Date(value))
  const day = parts.find((part) => part.type === "day")?.value
  const month = parts.find((part) => part.type === "month")?.value?.replace(".", "").slice(0, 3)
  const year = parts.find((part) => part.type === "year")?.value
  return `${day} ${month} ${year}`
}

export function formatAchievementHistoryDate(value: Date | string) {
  const parts = new Intl.DateTimeFormat("ru-RU", {
    day: "numeric",
    month: "short",
    year: "numeric",
    timeZone: "Europe/Moscow",
  }).formatToParts(new Date(value))
  const day = parts.find((part) => part.type === "day")?.value
  const month = parts.find((part) => part.type === "month")?.value?.replace(".", "").slice(0, 3)
  const year = parts.find((part) => part.type === "year")?.value
  return `${day} ${month} ${year}`
}

export type AchievementGalleryFilter = "all" | "earned" | "completed" | "in-progress" | "locked"

export type AchievementShowcaseStatusFields = {
  awardedAt: Date | string | null
  currentValue: number
  nextLevel: number | null
}

export function isAchievementEarned(item: AchievementShowcaseStatusFields) {
  return item.awardedAt !== null
}

export function isAchievementCompleted(item: AchievementShowcaseStatusFields) {
  return item.awardedAt !== null && item.nextLevel === null
}

export function isAchievementInProgress(item: AchievementShowcaseStatusFields) {
  if (item.nextLevel === null) return false
  return item.awardedAt !== null || item.currentValue > 0
}

export function isAchievementLocked(item: AchievementShowcaseStatusFields) {
  return item.awardedAt === null
}

export function getAchievementShowcaseStats(items: AchievementShowcaseStatusFields[]) {
  let earnedCount = 0
  let completedCount = 0
  let inProgressCount = 0

  for (const item of items) {
    if (isAchievementEarned(item)) earnedCount += 1
    if (isAchievementCompleted(item)) completedCount += 1
    if (isAchievementInProgress(item)) inProgressCount += 1
  }

  return { completedCount, earnedCount, inProgressCount }
}

export type AchievementNearestGoalFields = {
  awardedAt: Date | string | null
  currentValue: number
  description: string | null
  imageUrl: string | null
  name: string
  nextThreshold: number | null
}

export type AchievementNearestGoal = {
  currentValue: number
  description: string | null
  imageUrl: string | null
  isAwarded: boolean
  name: string
  nextThreshold: number
}

export function getNearestAchievementGoal<T extends AchievementNearestGoalFields>(items: T[]) {
  let nearest: { goal: AchievementNearestGoal; remaining: number } | null = null

  for (const item of items) {
    if (item.nextThreshold === null || item.nextThreshold <= 1) continue
    const remaining = item.nextThreshold - item.currentValue
    if (remaining <= 0) continue
    if (nearest === null || remaining < nearest.remaining) {
      nearest = {
        remaining,
        goal: {
          currentValue: item.currentValue,
          description: item.description,
          imageUrl: item.imageUrl,
          isAwarded: item.awardedAt !== null,
          name: item.name,
          nextThreshold: item.nextThreshold,
        },
      }
    }
  }

  return nearest?.goal ?? null
}

export function sortAchievementsByAwardedAt<T extends AchievementShowcaseStatusFields>(items: T[]) {
  return [...items].sort((left, right) => {
    if (left.awardedAt === null && right.awardedAt === null) return 0
    if (left.awardedAt === null) return 1
    if (right.awardedAt === null) return -1
    return new Date(right.awardedAt).getTime() - new Date(left.awardedAt).getTime()
  })
}

export function filterAchievementsByStatus<T extends AchievementShowcaseStatusFields>(
  items: T[],
  filter: AchievementGalleryFilter,
) {
  if (filter === "earned") return items.filter(isAchievementEarned)
  if (filter === "completed") return items.filter(isAchievementCompleted)
  if (filter === "in-progress") return items.filter(isAchievementInProgress)
  if (filter === "locked") return items.filter(isAchievementLocked)
  return items
}

export type AchievementHistoryEntry = {
  awardedAt: Date | string
  code: string
  description: string | null
  imageUrl: string | null
  key: string
  level: number
  levelCount: number
  name: string
}

export function listAchievementHistoryEntries(
  items: ReadonlyArray<{
    awardedLevels: ReadonlyArray<{
      awardedAt: Date | string
      description: string | null
      imageUrl: string | null
      level: number
      name: string
    }>
    code: string
    levelCount: number
  }>,
): AchievementHistoryEntry[] {
  return items
    .flatMap((item) => item.awardedLevels.map((level) => ({
      awardedAt: level.awardedAt,
      code: item.code,
      description: level.description,
      imageUrl: level.imageUrl,
      key: `${item.code}:${level.level}`,
      level: level.level,
      levelCount: item.levelCount,
      name: level.name,
    })))
    .sort((left, right) => {
      if (left.code === right.code && achievementHistoryDayKey(left.awardedAt) === achievementHistoryDayKey(right.awardedAt)) {
        return right.level - left.level
      }
      return new Date(right.awardedAt).getTime() - new Date(left.awardedAt).getTime()
    })
}

function achievementHistoryDayKey(value: Date | string) {
  return new Intl.DateTimeFormat("en-CA", {
    timeZone: "Europe/Moscow",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).format(new Date(value))
}
