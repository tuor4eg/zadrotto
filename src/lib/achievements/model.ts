export const ACHIEVEMENT_RARITIES = ["common", "rare", "epic", "legendary"] as const

export type AchievementRarity = (typeof ACHIEVEMENT_RARITIES)[number]

export const DEFAULT_ACHIEVEMENT_RARITY: AchievementRarity = "common"

export function isAchievementRarity(value: unknown): value is AchievementRarity {
  return ACHIEVEMENT_RARITIES.some((rarity) => rarity === value)
}
