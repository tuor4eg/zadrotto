import type { MediaType, MediaTypeOption } from "../lib/media/types";

export type MediaTypeFilter = MediaType | "all";
export type AuthorRatingFilter = "all" | "rated" | "unrated";
export type CatalogYearMode = "release" | "experience" | "rating";
export type CatalogYearFilter = number | null;

const MIN_CATALOG_YEAR = 1900;

export const CATALOG_SORTS = [
  "title",
  "release_year",
  "average_score",
  "ratings_count",
  "my_rating_score",
  "my_first_experience_year",
] as const;

export type CatalogSort = (typeof CATALOG_SORTS)[number];
export type CatalogSortDirection = "asc" | "desc";

export const DEFAULT_CATALOG_SORT: CatalogSort = "title";
export const AUTHOR_ONLY_CATALOG_SORTS = [
  "my_rating_score",
  "my_first_experience_year",
] as const satisfies readonly CatalogSort[];

export const AUTHOR_ONLY_CATALOG_YEAR_MODES = [
  "experience",
  "rating",
] as const satisfies readonly CatalogYearMode[];

export const DEFAULT_CATALOG_SORT_DIRECTIONS: Record<CatalogSort, CatalogSortDirection> = {
  title: "asc",
  release_year: "asc",
  average_score: "desc",
  ratings_count: "desc",
  my_rating_score: "desc",
  my_first_experience_year: "asc",
};

export type CatalogFilterItem = {
  title: string;
  originalTitle: string | null;
  code: string | null;
  mediaType: MediaType;
  releaseYear: number | null;
  currentAuthorScore: number | null;
  currentAuthorRatedAt?: Date | string | null;
  currentAuthorFirstExperiencedAt?: Date | string | null;
};

export type CatalogSortItem = {
  title: string;
  mediaType: MediaType;
  releaseYear: number | null;
  averageScore: number | null;
  ratingsCount: number;
  currentAuthorScore?: number | null;
  currentAuthorRatedAt?: Date | null;
  currentAuthorFirstExperiencedAt?: Date | string | null;
};

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
  authorRatingFilter: AuthorRatingFilter,
  yearFilter: CatalogYearFilter = null,
  yearMode: CatalogYearMode = "release",
) {
  const normalizedSearchQuery = searchQuery.trim().toLowerCase();

  return items.filter(
    (item) =>
      (mediaTypeFilter === "all" || item.mediaType === mediaTypeFilter) &&
      (authorRatingFilter === "all" ||
        (authorRatingFilter === "rated" && item.currentAuthorScore !== null) ||
        (authorRatingFilter === "unrated" && item.currentAuthorScore === null)) &&
      matchesYear(item, yearFilter, yearMode) &&
      matchesSearch(item, normalizedSearchQuery),
  );
}

export function parseMediaTypeFilter(
  mediaType: string | null,
  mediaTypes: readonly MediaTypeOption[],
): MediaTypeFilter {
  return mediaTypes.some((availableMediaType) => availableMediaType.code === mediaType)
    ? (mediaType as MediaType)
    : "all";
}

export function parseAuthorRatingFilter(filter: string | null): AuthorRatingFilter {
  return filter === "rated" || filter === "unrated" ? filter : "all";
}

export function parseCatalogYear(value: string | null): CatalogYearFilter {
  if (!value) {
    return null;
  }

  const year = Number(value);
  const maxCatalogYear = new Date().getFullYear();

  return Number.isInteger(year) && year >= MIN_CATALOG_YEAR && year <= maxCatalogYear
    ? year
    : null;
}

export function parseCatalogYearMode(mode: string | null): CatalogYearMode {
  return mode === "experience" || mode === "rating" ? mode : "release";
}

export function isAuthorOnlyCatalogYearMode(mode: CatalogYearMode) {
  return AUTHOR_ONLY_CATALOG_YEAR_MODES.some((authorOnlyMode) => authorOnlyMode === mode);
}

export function parseCatalogSort(sort: string | null): CatalogSort {
  return CATALOG_SORTS.some((catalogSort) => catalogSort === sort)
    ? (sort as CatalogSort)
    : DEFAULT_CATALOG_SORT;
}

export function isAuthorOnlyCatalogSort(sort: CatalogSort) {
  return AUTHOR_ONLY_CATALOG_SORTS.some((authorOnlySort) => authorOnlySort === sort);
}

export function parseCatalogSortDirection(
  direction: string | null,
  sort: CatalogSort,
): CatalogSortDirection {
  return direction === "asc" || direction === "desc"
    ? direction
    : DEFAULT_CATALOG_SORT_DIRECTIONS[sort];
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

function getDateTime(value: Date | string | null | undefined) {
  if (!value) {
    return null;
  }

  const time = value instanceof Date ? value.getTime() : new Date(value).getTime();

  return Number.isNaN(time) ? null : time;
}

function getYearFromDate(value: Date | string | null | undefined) {
  const time = getDateTime(value);

  if (time === null) {
    return null;
  }

  return new Date(time).getFullYear();
}

export function matchesYear(
  item: CatalogFilterItem,
  yearFilter: CatalogYearFilter,
  yearMode: CatalogYearMode,
) {
  if (yearFilter === null) {
    return true;
  }

  if (yearMode === "experience") {
    return getYearFromDate(item.currentAuthorFirstExperiencedAt) === yearFilter;
  }

  if (yearMode === "rating") {
    return getYearFromDate(item.currentAuthorRatedAt) === yearFilter;
  }

  return item.releaseYear === yearFilter;
}

export function sortCatalogItems<TItem extends CatalogSortItem>(
  items: TItem[],
  sort: CatalogSort,
  direction: CatalogSortDirection = DEFAULT_CATALOG_SORT_DIRECTIONS[sort],
) {
  return [...items].sort((left, right) => {
    const titleFallback = compareTitles(left.title, right.title);

    if (sort === "release_year") {
      return compareNullableNumbers(left.releaseYear, right.releaseYear, direction) || titleFallback;
    }

    if (sort === "average_score") {
      return compareNullableNumbers(left.averageScore, right.averageScore, direction) || titleFallback;
    }

    if (sort === "ratings_count") {
      const ratingsCountDifference = left.ratingsCount - right.ratingsCount;

      return (direction === "asc" ? ratingsCountDifference : -ratingsCountDifference) || titleFallback;
    }

    if (sort === "my_rating_score") {
      return (
        compareNullableNumbers(
          left.currentAuthorScore ?? null,
          right.currentAuthorScore ?? null,
          direction,
        ) || titleFallback
      );
    }

    if (sort === "my_first_experience_year") {
      return (
        compareNullableNumbers(
          getDateTime(left.currentAuthorFirstExperiencedAt),
          getDateTime(right.currentAuthorFirstExperiencedAt),
          direction,
        ) || titleFallback
      );
    }

    return direction === "asc" ? titleFallback : -titleFallback;
  });
}
