import {
  PUBLICATION_STATUSES,
  type PublicationStatus,
} from "@/lib/media/publication-status";

export type AuthorFranchiseSubmissionStatusFilter = PublicationStatus | "all";

export type AuthorFranchiseSubmissionFilterItem = {
  franchiseCode: string;
  franchiseOriginalTitle: string | null;
  franchiseTitle: string;
  publicationStatus: PublicationStatus;
  mediaItemCode?: string;
  mediaItemTitle?: string;
};

export function parseAuthorFranchiseSubmissionStatusFilter(value: string | undefined) {
  return PUBLICATION_STATUSES.some((status) => status === value)
    ? (value as PublicationStatus)
    : "all";
}

export function filterAuthorFranchiseSubmissions<TItem extends AuthorFranchiseSubmissionFilterItem>(
  items: TItem[],
  filters: {
    searchQuery: string;
    status: AuthorFranchiseSubmissionStatusFilter;
  },
) {
  const normalizedSearchQuery = filters.searchQuery.trim().toLowerCase();

  return items.filter((item) => {
    const matchesStatus = filters.status === "all" || item.publicationStatus === filters.status;
    const matchesSearch =
      !normalizedSearchQuery ||
      [
        item.franchiseTitle,
        item.franchiseOriginalTitle,
        item.franchiseCode,
        item.mediaItemTitle,
        item.mediaItemCode,
      ].some(
        (value) => value !== null && value !== undefined && value.toLowerCase().includes(normalizedSearchQuery),
      );

    return matchesStatus && matchesSearch;
  });
}
