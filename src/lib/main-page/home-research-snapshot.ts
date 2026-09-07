import type { AuthorDigitalProfile } from "@/db/queries/author-digital-profile"
import type { DemoProfile } from "@/lib/user-state/demo-profile"
import { getDemoRatingsCount } from "@/lib/user-state/demo-profile"
import {
  getAuthorResearchMessage,
  type AuthorResearchMessage,
} from "@/lib/main-page/author-research-message"
import { formatScore } from "@/lib/ratings/score"

export type HomeResearchSnapshot = {
  averageScore: number | null
  contributionCount: number
  digitalProfile: AuthorDigitalProfile
  ratingsCount: number
  reviewCount: number
  selectionSeed: number
}

export type HomeHeroStatisticItem = {
  label: string
  value: string
}

export const EMPTY_HOME_DIGITAL_PROFILE: AuthorDigitalProfile = {
  activeSeries: null,
  bestKnownType: null,
  seriesRated: 0,
  seriesTotal: 0,
  strongestSeries: null,
  strongestSeriesCount: 0,
  unexploredType: null,
}

function hashSeed(value: string) {
  let hash = 0
  for (let index = 0; index < value.length; index += 1) {
    hash = (hash * 31 + value.charCodeAt(index)) >>> 0
  }
  return hash || 1
}

export function buildHomeResearchSnapshotFromAuthor(input: {
  authorId: number
  averageScore: number | null
  contributionCount: number
  digitalProfile: AuthorDigitalProfile
  ratingsCount: number
  reviewCount: number
}): HomeResearchSnapshot {
  return {
    averageScore: input.averageScore,
    contributionCount: input.contributionCount,
    digitalProfile: input.digitalProfile,
    ratingsCount: input.ratingsCount,
    reviewCount: input.reviewCount,
    selectionSeed: input.authorId,
  }
}

export function buildHomeResearchSnapshotFromDemo(profile: DemoProfile): HomeResearchSnapshot {
  const ratings = Object.values(profile.ratings)
  const ratingsCount = getDemoRatingsCount(profile)
  const averageScore = ratingsCount === 0
    ? null
    : Math.round(ratings.reduce((sum, entry) => sum + entry.score, 0) / ratingsCount)

  return {
    averageScore,
    contributionCount: 0,
    digitalProfile: EMPTY_HOME_DIGITAL_PROFILE,
    ratingsCount,
    reviewCount: 0,
    selectionSeed: hashSeed(profile.createdAt),
  }
}

export function getHomeResearchMessage(snapshot: HomeResearchSnapshot): AuthorResearchMessage {
  return getAuthorResearchMessage({
    averageScore: snapshot.averageScore,
    contributionCount: snapshot.contributionCount,
    digitalProfile: snapshot.digitalProfile,
    ratingsCount: snapshot.ratingsCount,
    reviewCount: snapshot.reviewCount,
    selectionSeed: snapshot.selectionSeed,
  })
}

export function buildHomeHeroStatisticItems(
  snapshot: HomeResearchSnapshot,
): HomeHeroStatisticItem[] {
  return [
    { label: "Оценок", rawValue: snapshot.ratingsCount },
    { label: "Средняя оценка", rawValue: snapshot.averageScore },
    { label: "Рецензий", rawValue: snapshot.reviewCount },
    { label: "Добавлено в архив", rawValue: snapshot.contributionCount },
  ]
    .filter((statistic): statistic is { label: string; rawValue: number } => (
      statistic.rawValue !== null && statistic.rawValue > 0
    ))
    .map((statistic) => ({
      label: statistic.label,
      value: statistic.label === "Средняя оценка"
        ? formatScore(statistic.rawValue)
        : statistic.rawValue.toLocaleString("ru-RU"),
    }))
}
