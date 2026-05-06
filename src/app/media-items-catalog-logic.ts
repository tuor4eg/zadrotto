import { MEDIA_TYPES, type MediaType } from "../lib/media-types";

export type MediaTypeFilter = MediaType | "all";
export type AuthorRatingFilter = "all" | "rated" | "unrated";

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
  currentAuthorScore: number | null;
};

export type CatalogSortItem = {
  title: string;
  mediaType: MediaType;
  releaseYear: number | null;
  averageScore: number | null;
  ratingsCount: number;
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
