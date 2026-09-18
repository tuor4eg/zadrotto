import type { AchievementRarity } from "@/lib/achievements/model"

export const FEATURED_SHOWCASE_LIMIT = 5
export const FEATURED_SHOWCASE_MAX_PER_CATEGORY = 2
export const DEFAULT_ACHIEVEMENT_SHOWCASE_BACKGROUND_URL =
  "/achievements/default-showcase-background.webp"

export function resolveFeaturedShowcaseBackgroundUrl(
  levelShowcaseBackgroundImageUrl: string | null,
  defaultShowcaseBackgroundImageUrl: string | null,
) {
  return levelShowcaseBackgroundImageUrl
    ?? defaultShowcaseBackgroundImageUrl
    ?? DEFAULT_ACHIEVEMENT_SHOWCASE_BACKGROUND_URL
}

const STARTER_ACHIEVEMENT_CODES = new Set([
  "first-rating",
  "first-published-review",
])

const RARITY_RANK: Record<AchievementRarity, number> = {
  legendary: 4,
  epic: 3,
  rare: 2,
  common: 1,
}

export type FeaturedShowcaseSignificance = "thematic" | "basicQuantitative" | "starter"

export type FeaturedShowcaseCategory =
  | "rating.general"
  | "rating.mediaType"
  | "rating.series"
  | "review"
  | "media"
  | "quiz"
  | "bug-report"
  | "other"

export type FeaturedShowcaseCandidate = {
  awardedAt: Date | string | null
  awardedThreshold: number | null
  code: string
  highestAwardedLevel: number | null
  levelCount: number
  mechanic: string
  params: Record<string, unknown>
  rarity: AchievementRarity
}

function isEmptyParams(params: Record<string, unknown>) {
  return Object.keys(params).length === 0
}

function isCountMechanic(mechanic: string) {
  return mechanic.endsWith(".count")
}

export function getFeaturedShowcaseSignificance(
  candidate: Pick<
    FeaturedShowcaseCandidate,
    "awardedThreshold" | "code" | "mechanic" | "params"
  >,
): FeaturedShowcaseSignificance {
  if (STARTER_ACHIEVEMENT_CODES.has(candidate.code)) return "starter"
  if (
    candidate.awardedThreshold === 1
    && isCountMechanic(candidate.mechanic)
    && isEmptyParams(candidate.params)
  ) {
    return "starter"
  }

  if (candidate.mechanic === "rating.authored.count") {
    if (typeof candidate.params.seriesId === "number") return "thematic"
    if (typeof candidate.params.mediaType === "string" || isEmptyParams(candidate.params)) {
      return "basicQuantitative"
    }
  }

  return "thematic"
}

export function getFeaturedShowcaseCategory(
  candidate: Pick<FeaturedShowcaseCandidate, "mechanic" | "params">,
): FeaturedShowcaseCategory {
  if (candidate.mechanic === "rating.authored.count") {
    if (typeof candidate.params.seriesId === "number") return "rating.series"
    if (typeof candidate.params.mediaType === "string") return "rating.mediaType"
    return "rating.general"
  }
  if (candidate.mechanic.startsWith("review.")) return "review"
  if (candidate.mechanic.startsWith("media.")) return "media"
  if (candidate.mechanic.startsWith("quiz.")) return "quiz"
  if (candidate.mechanic.startsWith("bug-report.")) return "bug-report"
  return "other"
}

function isChainComplete(candidate: FeaturedShowcaseCandidate) {
  return candidate.highestAwardedLevel !== null
    && candidate.highestAwardedLevel === candidate.levelCount
}

function compareFeaturedShowcaseCandidates(
  left: FeaturedShowcaseCandidate,
  right: FeaturedShowcaseCandidate,
) {
  const rarityDiff = RARITY_RANK[right.rarity] - RARITY_RANK[left.rarity]
  if (rarityDiff !== 0) return rarityDiff

  const completedDiff = Number(isChainComplete(right)) - Number(isChainComplete(left))
  if (completedDiff !== 0) return completedDiff

  const levelDiff = (right.highestAwardedLevel ?? 0) - (left.highestAwardedLevel ?? 0)
  if (levelDiff !== 0) return levelDiff

  const leftAwardedAt = left.awardedAt ? new Date(left.awardedAt).getTime() : 0
  const rightAwardedAt = right.awardedAt ? new Date(right.awardedAt).getTime() : 0
  return rightAwardedAt - leftAwardedAt
}

function canAcceptCandidate(
  categoryCounts: Map<FeaturedShowcaseCategory, number>,
  category: FeaturedShowcaseCategory,
) {
  return (categoryCounts.get(category) ?? 0) < FEATURED_SHOWCASE_MAX_PER_CATEGORY
}

export function selectFeaturedShowcaseAchievements<T extends FeaturedShowcaseCandidate>(
  items: readonly T[],
  limit = FEATURED_SHOWCASE_LIMIT,
): T[] {
  const candidates = items.filter((item) => (
    item.awardedAt !== null
    && getFeaturedShowcaseSignificance(item) === "thematic"
  ))
  const sorted = [...candidates].sort(compareFeaturedShowcaseCandidates)
  const selected: T[] = []
  const selectedCodes = new Set<string>()
  const categoryCounts = new Map<FeaturedShowcaseCategory, number>()

  for (const candidate of sorted) {
    if (selected.length >= limit) break
    if (selectedCodes.has(candidate.code)) continue
    const category = getFeaturedShowcaseCategory(candidate)
    if (!canAcceptCandidate(categoryCounts, category)) continue
    selected.push(candidate)
    selectedCodes.add(candidate.code)
    categoryCounts.set(category, (categoryCounts.get(category) ?? 0) + 1)
  }

  if (selected.length < limit) {
    for (const candidate of sorted) {
      if (selected.length >= limit) break
      if (selectedCodes.has(candidate.code)) continue
      selected.push(candidate)
      selectedCodes.add(candidate.code)
    }
  }

  return selected
}
