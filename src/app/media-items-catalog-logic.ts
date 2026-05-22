import { MEDIA_TYPES, type MediaType } from "../lib/media-types";

export type MediaTypeFilter = MediaType | "all";
export type AuthorRatingFilter = "all" | "rated" | "unrated";

export const CATALOG_SORTS = [
  "title",
  "release_year",
  "average_score",
  "ratings_count",
  "my_rating_order",
  "my_first_experience_year",
] as const;

export type CatalogSort = (typeof CATALOG_SORTS)[number];
export type CatalogSortDirection = "asc" | "desc";

export const DEFAULT_CATALOG_SORT: CatalogSort = "title";
export const AUTHOR_ONLY_CATALOG_SORTS = [
  "my_rating_order",
  "my_first_experience_year",
] as const satisfies readonly CatalogSort[];

export const DEFAULT_CATALOG_SORT_DIRECTIONS: Record<CatalogSort, CatalogSortDirection> = {
  title: "asc",
  release_year: "asc",
  average_score: "desc",
  ratings_count: "desc",
  my_rating_order: "desc",
  my_first_experience_year: "asc",
};

export type CatalogFilterItem = {
  title: string;
  originalTitle: string | null;
  code: string | null;
  mediaType: MediaType;
  currentAuthorScore: number | null;
};

export type CatalogSortItem = {
  title: string;
  mediaType: MediaType;
  releaseYear: number | null;
  averageScore: number | null;
  ratingsCount: number;
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
) {
  const normalizedSearchQuery = searchQuery.trim().toLowerCase();

  return items.filter(
    (item) =>
      (mediaTypeFilter === "all" || item.mediaType === mediaTypeFilter) &&
      (authorRatingFilter === "all" ||
        (authorRatingFilter === "rated" && item.currentAuthorScore !== null) ||
        (authorRatingFilter === "unrated" && item.currentAuthorScore === null)) &&
      matchesSearch(item, normalizedSearchQuery),
  );
}

export function parseMediaTypeFilter(mediaType: string | null): MediaTypeFilter {
  return MEDIA_TYPES.some((availableMediaType) => availableMediaType === mediaType)
    ? (mediaType as MediaType)
    : "all";
}

export function parseAuthorRatingFilter(filter: string | null): AuthorRatingFilter {
  return filter === "rated" || filter === "unrated" ? filter : "all";
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

    if (sort === "my_rating_order") {
      return (
        compareNullableNumbers(
          getDateTime(left.currentAuthorRatedAt),
          getDateTime(right.currentAuthorRatedAt),
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
