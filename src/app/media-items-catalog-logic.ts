import { MEDIA_TYPES, type MediaType } from "../lib/media-types";

export type MediaTypeFilter = MediaType | "all";

export const CATALOG_SORTS = [
  "title",
  "release_year",
  "media_type",
  "average_score",
  "ratings_count",
] as const;

export type CatalogSort = (typeof CATALOG_SORTS)[number];

export const DEFAULT_CATALOG_SORT: CatalogSort = "title";

export type CatalogFilterItem = {
  title: string;
  originalTitle: string | null;
  code: string | null;
  mediaType: MediaType;
};

export type CatalogSortItem = {
  title: string;
  mediaType: MediaType;
  releaseYear: number | null;
  averageScore: number | null;
  ratingsCount: number;
};

export function formatScore(score: number | null) {
  return score === null ? "\u2014" : (score / 10).toFixed(1);
}

export function formatRatingsCount(count: number) {
  const lastTwoDigits = count % 100;

  if (lastTwoDigits >= 11 && lastTwoDigits <= 14) {
    return `${count} оценок`;
  }

  const lastDigit = count % 10;

  if (lastDigit === 1) {
    return `${count} оценка`;
  }

  if (lastDigit >= 2 && lastDigit <= 4) {
    return `${count} оценки`;
  }

  return `${count} оценок`;
}

export function matchesSearch(item: CatalogFilterItem, normalizedSearchQuery: string) {
  if (!normalizedSearchQuery) {
    return true;
  }

  return [item.title, item.originalTitle, item.code].some(
    (value) => value !== null && value.toLowerCase().includes(normalizedSearchQuery),
  );
}

export function filterCatalogItems<TItem extends CatalogFilterItem>(
  items: TItem[],
  searchQuery: string,
  mediaTypeFilter: MediaTypeFilter,
) {
  const normalizedSearchQuery = searchQuery.trim().toLowerCase();

  return items.filter(
    (item) =>
      (mediaTypeFilter === "all" || item.mediaType === mediaTypeFilter) &&
      matchesSearch(item, normalizedSearchQuery),
  );
}

export function parseMediaTypeFilter(mediaType: string | null): MediaTypeFilter {
  return MEDIA_TYPES.some((availableMediaType) => availableMediaType === mediaType)
    ? (mediaType as MediaType)
    : "all";
}

export function parseCatalogSort(sort: string | null): CatalogSort {
  return CATALOG_SORTS.some((catalogSort) => catalogSort === sort)
    ? (sort as CatalogSort)
    : DEFAULT_CATALOG_SORT;
}

function compareNullableNumbers(
  left: number | null,
  right: number | null,
  direction: "asc" | "desc",
) {
  if (left === null && right === null) {
    return 0;
  }

  if (left === null) {
    return 1;
  }

  if (right === null) {
    return -1;
  }

  return direction === "asc" ? left - right : right - left;
}

function compareTitles(left: string, right: string) {
  return left.localeCompare(right, "ru");
}

export function sortCatalogItems<TItem extends CatalogSortItem>(
  items: TItem[],
  sort: CatalogSort,
) {
  return [...items].sort((left, right) => {
    const titleFallback = compareTitles(left.title, right.title);

    if (sort === "release_year") {
      return compareNullableNumbers(left.releaseYear, right.releaseYear, "asc") || titleFallback;
    }

    if (sort === "media_type") {
      return (
        MEDIA_TYPES.indexOf(left.mediaType) - MEDIA_TYPES.indexOf(right.mediaType) || titleFallback
      );
    }

    if (sort === "average_score") {
      return compareNullableNumbers(left.averageScore, right.averageScore, "desc") || titleFallback;
    }

    if (sort === "ratings_count") {
      return right.ratingsCount - left.ratingsCount || titleFallback;
    }

    return titleFallback;
  });
}
