import { MEDIA_TYPES, type MediaType } from "@/lib/media-types";
import { PUBLICATION_STATUSES, type PublicationStatus } from "@/lib/publication-status";

export type AuthorMediaTypeFilter = MediaType | "all";
export type AuthorMediaStatusFilter = PublicationStatus | "all";

export type AuthorMediaFilterItem = {
  title: string;
  originalTitle: string | null;
  code: string;
  mediaType: MediaType;
  publicationStatus: PublicationStatus;
};

export function parseAuthorMediaTypeFilter(value: string | undefined) {
  return MEDIA_TYPES.some((mediaType) => mediaType === value)
    ? (value as MediaType)
    : "all";
}

export function parseAuthorMediaStatusFilter(value: string | undefined) {
  return PUBLICATION_STATUSES.some((status) => status === value)
    ? (value as PublicationStatus)
    : "all";
}

export function normalizeAuthorMediaSearch(value: string | undefined) {
  return value?.trim().toLowerCase() ?? "";
}

export function filterAuthorMediaItems<TItem extends AuthorMediaFilterItem>(
  items: TItem[],
  filters: {
    searchQuery: string;
    mediaType: AuthorMediaTypeFilter;
    status: AuthorMediaStatusFilter;
  },
) {
  const normalizedSearchQuery = normalizeAuthorMediaSearch(filters.searchQuery);

  return items.filter((item) => {
    const matchesType = filters.mediaType === "all" || item.mediaType === filters.mediaType;
    const matchesStatus =
      filters.status === "all" || item.publicationStatus === filters.status;
    const matchesSearch =
      !normalizedSearchQuery ||
      [item.title, item.originalTitle, item.code].some(
        (value) => value !== null && value.toLowerCase().includes(normalizedSearchQuery),
      );

    return matchesType && matchesStatus && matchesSearch;
  });
}
