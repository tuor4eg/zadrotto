import { isMediaTypeCode } from "@/lib/media/types";

export const ADMIN_MEDIA_BROWSER_SORTS = [
  "average_score",
  "ratings_count",
  "release_year",
  "title",
] as const;

export const ADMIN_MEDIA_BROWSER_SORT_DIRECTIONS = ["asc", "desc"] as const;
export const ADMIN_MEDIA_BROWSER_SERIES_SCOPES = ["direct", "descendants"] as const;
export const ADMIN_MEDIA_BROWSER_PAGE_SIZE_OPTIONS = [24, 48, 96] as const;
export const DEFAULT_ADMIN_MEDIA_BROWSER_PAGE_SIZE = 24;

export type AdminMediaBrowserSort = (typeof ADMIN_MEDIA_BROWSER_SORTS)[number];
export type AdminMediaBrowserSortDirection =
  (typeof ADMIN_MEDIA_BROWSER_SORT_DIRECTIONS)[number];
export type AdminMediaBrowserSeriesScope =
  (typeof ADMIN_MEDIA_BROWSER_SERIES_SCOPES)[number];

export type AdminMediaBrowserQuery = {
  direction: AdminMediaBrowserSortDirection;
  franchiseId: number | null;
  mediaType: string | null;
  minAverageScore: number | null;
  page: number;
  pageSize: number;
  searchQuery: string;
  seriesScope: AdminMediaBrowserSeriesScope;
  sort: AdminMediaBrowserSort;
};

export type AdminMediaBrowserFranchise = {
  code: string;
  id: number;
  title: string;
};

export type AdminMediaBrowserItem = {
  averageScore: number | null;
  code: string;
  coverThumbUrl: string | null;
  coverUrl: string | null;
  franchises: AdminMediaBrowserFranchise[];
  id: number;
  mediaCarrierName: string | null;
  mediaType: string;
  mediaTypeLabel: string;
  metadataFacts: Record<string, unknown> | null;
  originalTitle: string | null;
  ratingsCount: number;
  releaseYear: number | null;
  title: string;
};

export type AdminMediaBrowserResult = {
  items: AdminMediaBrowserItem[];
  page: number;
  pageSize: number;
  totalCount: number;
  totalPages: number;
};

export type AdminMediaBrowserSeriesOption = {
  id: number;
  originalTitle: string | null;
  path: string;
  title: string;
};

const DEFAULT_SORT_DIRECTIONS: Record<
  AdminMediaBrowserSort,
  AdminMediaBrowserSortDirection
> = {
  average_score: "desc",
  ratings_count: "desc",
  release_year: "desc",
  title: "asc",
};

function parsePositiveInteger(value: string | null) {
  const parsed = Number(value);

  return Number.isSafeInteger(parsed) && parsed > 0 ? parsed : null;
}

function parseSort(value: string | null): AdminMediaBrowserSort {
  return ADMIN_MEDIA_BROWSER_SORTS.some((sort) => sort === value)
    ? (value as AdminMediaBrowserSort)
    : "title";
}

function parseDirection(
  value: string | null,
  sort: AdminMediaBrowserSort,
): AdminMediaBrowserSortDirection {
  return ADMIN_MEDIA_BROWSER_SORT_DIRECTIONS.some((direction) => direction === value)
    ? (value as AdminMediaBrowserSortDirection)
    : DEFAULT_SORT_DIRECTIONS[sort];
}

function parseSeriesScope(value: string | null): AdminMediaBrowserSeriesScope {
  return value === "descendants" ? "descendants" : "direct";
}

function parseMinAverageScore(value: string | null) {
  if (!value?.trim()) {
    return null;
  }

  const parsed = Number(value.replace(",", "."));

  if (!Number.isFinite(parsed) || parsed < 1 || parsed > 10) {
    return null;
  }

  return Math.round(parsed * 10) / 10;
}

function parsePageSize(value: string | null) {
  const parsed = Number(value);

  return ADMIN_MEDIA_BROWSER_PAGE_SIZE_OPTIONS.some((pageSize) => pageSize === parsed)
    ? parsed
    : DEFAULT_ADMIN_MEDIA_BROWSER_PAGE_SIZE;
}

export function parseAdminMediaBrowserQuery(
  searchParams: URLSearchParams,
): AdminMediaBrowserQuery {
  const sort = parseSort(searchParams.get("sort"));
  const mediaType = searchParams.get("type")?.trim() ?? "";

  return {
    direction: parseDirection(searchParams.get("direction"), sort),
    franchiseId: parsePositiveInteger(searchParams.get("series")),
    mediaType: isMediaTypeCode(mediaType) ? mediaType : null,
    minAverageScore: parseMinAverageScore(searchParams.get("minScore")),
    page: parsePositiveInteger(searchParams.get("page")) ?? 1,
    pageSize: parsePageSize(searchParams.get("pageSize")),
    searchQuery: (searchParams.get("q") ?? "").trim().slice(0, 200),
    seriesScope: parseSeriesScope(searchParams.get("seriesScope")),
    sort,
  };
}
