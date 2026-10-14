import { getRatingDistributionScore } from "@/lib/ratings/score"
import type { HomeAuthorStatisticsData } from "@/app/main/home-author-statistics"
import { getDemoRatedCodes, getDemoEffectiveScore, type DemoProfile } from "@/lib/user-state/demo-profile"

export const DEMO_HOME_STATISTICS_CODE_LIMIT = 2_000

export type DemoHomeStatisticsMediaItem = {
  code: string
  mediaType: string
  releaseYear: number | null
}

export function normalizeDemoHomeStatisticsCodes(codes: readonly unknown[]) {
  return [...new Set(codes.filter((code): code is string => (
    typeof code === "string" && code.trim() !== "" && code.length <= 200
  )))].slice(0, DEMO_HOME_STATISTICS_CODE_LIMIT)
}

export function parseDemoHomeStatisticsMediaItems(raw: unknown) {
  if (!raw || typeof raw !== "object") return [] as DemoHomeStatisticsMediaItem[]
  const items = (raw as { items?: unknown }).items
  if (!Array.isArray(items)) return [] as DemoHomeStatisticsMediaItem[]

  return items.flatMap((item) => {
    if (!item || typeof item !== "object") return []
    const value = item as Record<string, unknown>
    if (
      typeof value.code !== "string"
      || value.code.trim() === ""
      || typeof value.mediaType !== "string"
      || value.mediaType.trim() === ""
      || (value.releaseYear !== null && !Number.isInteger(value.releaseYear))
    ) {
      return []
    }

    return [{
      code: value.code,
      mediaType: value.mediaType,
      releaseYear: value.releaseYear as number | null,
    }]
  })
}

export function buildDemoHomeStatistics(
  profile: DemoProfile,
  mediaItems: readonly DemoHomeStatisticsMediaItem[],
): HomeAuthorStatisticsData {
  const scoreCounts = new Map<number, number>()
  for (const code of getDemoRatedCodes(profile)) {
    const score = getRatingDistributionScore(getDemoEffectiveScore(profile, code)!)
    scoreCounts.set(score, (scoreCounts.get(score) ?? 0) + 1)
  }
  const scoreMediaTypeCounts = new Map<string, {
    mediaType: string
    ratingsCount: number
    score: number
  }>()

  const releaseYearCounts = new Map<number, number>()
  const releaseYearMediaTypeCounts = new Map<string, {
    count: number
    mediaType: string
    year: number
  }>()
  const seenCodes = new Set<string>()

  for (const item of mediaItems) {
    const effectiveScore = getDemoEffectiveScore(profile, item.code)
    const score = effectiveScore === null ? null : getRatingDistributionScore(effectiveScore)
    if (seenCodes.has(item.code) || score === null) continue
    seenCodes.add(item.code)
    const scoreKey = `${item.mediaType}\0${score}`
    const currentScore = scoreMediaTypeCounts.get(scoreKey)
    scoreMediaTypeCounts.set(scoreKey, {
      mediaType: item.mediaType,
      ratingsCount: (currentScore?.ratingsCount ?? 0) + 1,
      score: score,
    })
    if (item.releaseYear === null) continue
    releaseYearCounts.set(item.releaseYear, (releaseYearCounts.get(item.releaseYear) ?? 0) + 1)

    const key = `${item.releaseYear}\0${item.mediaType}`
    const current = releaseYearMediaTypeCounts.get(key)
    releaseYearMediaTypeCounts.set(key, {
      count: (current?.count ?? 0) + 1,
      mediaType: item.mediaType,
      year: item.releaseYear,
    })
  }

  return {
    releaseYearDistribution: [...releaseYearCounts]
      .map(([year, count]) => ({ count, year }))
      .sort((left, right) => left.year - right.year),
    releaseYearMediaTypeDistribution: [...releaseYearMediaTypeCounts.values()]
      .sort((left, right) => left.year - right.year || left.mediaType.localeCompare(right.mediaType)),
    scoreDistribution: [...scoreCounts]
      .map(([score, ratingsCount]) => ({ ratingsCount, score }))
      .sort((left, right) => left.score - right.score),
    scoreMediaTypeDistribution: [...scoreMediaTypeCounts.values()]
      .sort((left, right) => left.score - right.score || left.mediaType.localeCompare(right.mediaType)),
  }
}
