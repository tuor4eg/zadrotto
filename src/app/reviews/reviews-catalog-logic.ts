import {
  CONTRIBUTION_STATUS_LABELS,
} from "@/lib/contributions/model"

export const REVIEW_CATALOG_PAGE_SIZE_OPTIONS = [24, 48, 72] as const
export const DEFAULT_REVIEW_CATALOG_PAGE_SIZE = 24

export const REVIEW_CATALOG_VIEWS = ["all", "mine"] as const
export type ReviewCatalogView = (typeof REVIEW_CATALOG_VIEWS)[number]

export const MY_REVIEW_STATUS_FILTERS = ["all", "published", "draft", "submitted"] as const
export type MyReviewStatusFilter = (typeof MY_REVIEW_STATUS_FILTERS)[number]

export const MY_REVIEW_STATUS_FILTER_LABELS: Record<MyReviewStatusFilter, string> = {
  all: "Все",
  published: CONTRIBUTION_STATUS_LABELS.published,
  draft: CONTRIBUTION_STATUS_LABELS.draft,
  submitted: CONTRIBUTION_STATUS_LABELS.submitted,
}

export const REVIEW_CATALOG_PRESETS = ["all", "fresh", "high", "long", "short"] as const
export type ReviewCatalogPreset = (typeof REVIEW_CATALOG_PRESETS)[number]

export const REVIEW_CATALOG_SCORE_FILTERS = [
  "all",
  "10",
  "9",
  "8",
  "7",
  "6",
  "low",
  "none",
] as const
export type ReviewCatalogScoreFilter = (typeof REVIEW_CATALOG_SCORE_FILTERS)[number]

export const REVIEW_CATALOG_PRESET_LABELS: Record<ReviewCatalogPreset, string> = {
  all: "Все",
  fresh: "Свежие",
  high: "Высокая оценка",
  long: "Длинные",
  short: "Короткие",
}

export const REVIEW_CATALOG_SCORE_FILTER_LABELS: Record<ReviewCatalogScoreFilter, string> = {
  all: "Все оценки",
  "10": "10",
  "9": "9",
  "8": "8",
  "7": "7",
  "6": "6",
  low: "5 и ниже",
  none: "Без оценки",
}

export function parseReviewCatalogView(value: string | null | undefined): ReviewCatalogView {
  return value === "mine" ? "mine" : "all"
}

export function parseMyReviewStatusFilter(
  value: string | null | undefined,
): MyReviewStatusFilter {
  return MY_REVIEW_STATUS_FILTERS.includes(value as MyReviewStatusFilter)
    ? (value as MyReviewStatusFilter)
    : "all"
}

export function parseReviewCatalogPreset(value: string | null | undefined): ReviewCatalogPreset {
  return REVIEW_CATALOG_PRESETS.includes(value as ReviewCatalogPreset)
    ? (value as ReviewCatalogPreset)
    : "all"
}

export function parseReviewCatalogScoreFilter(
  value: string | null | undefined,
): ReviewCatalogScoreFilter {
  return REVIEW_CATALOG_SCORE_FILTERS.includes(value as ReviewCatalogScoreFilter)
    ? (value as ReviewCatalogScoreFilter)
    : "all"
}

export function parseReviewCatalogAuthorId(value: string | null | undefined) {
  if (!value || value === "all") {
    return null
  }

  const authorId = Number(value)

  return Number.isSafeInteger(authorId) && authorId > 0 ? authorId : null
}

export function parseReviewCatalogMediaType(
  value: string | null | undefined,
  enabledMediaTypeCodes: readonly string[],
) {
  if (!value || value === "all") {
    return "all" as const
  }

  return enabledMediaTypeCodes.includes(value) ? value : ("all" as const)
}
