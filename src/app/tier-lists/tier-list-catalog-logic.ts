export const TIER_LIST_CATALOG_PAGE_SIZE_OPTIONS = [24, 48, 72] as const
export const DEFAULT_TIER_LIST_CATALOG_PAGE_SIZE = 24

export const TIER_LIST_CATALOG_SORTS = ["newest", "oldest", "title"] as const
export type TierListCatalogSort = (typeof TIER_LIST_CATALOG_SORTS)[number]

export const TIER_LIST_CATALOG_SORT_LABELS: Record<TierListCatalogSort, string> = {
  newest: "Сначала новые",
  oldest: "Сначала старые",
  title: "По названию",
}

export const TIER_LIST_MINE_STATUSES = ["all", "published", "draft", "hidden"] as const
export type TierListMineStatus = (typeof TIER_LIST_MINE_STATUSES)[number]

export const TIER_LIST_MINE_STATUS_LABELS: Record<TierListMineStatus, string> = {
  all: "Все",
  published: "Опубликованные",
  draft: "Черновики",
  hidden: "Скрытые",
}

export function parseTierListCatalogSort(value: string | null | undefined): TierListCatalogSort {
  return TIER_LIST_CATALOG_SORTS.includes(value as TierListCatalogSort)
    ? (value as TierListCatalogSort)
    : "newest"
}

export function parseTierListMineStatus(value: string | null | undefined): TierListMineStatus {
  return TIER_LIST_MINE_STATUSES.includes(value as TierListMineStatus)
    ? (value as TierListMineStatus)
    : "all"
}

export function parseTierListCatalogAuthorId(value: string | null | undefined) {
  if (!value || value === "all") return null

  const authorId = Number(value)

  return Number.isSafeInteger(authorId) && authorId > 0 ? authorId : null
}
