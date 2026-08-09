import type { PublicationStatus } from "@/lib/media/publication-status";
import { matchesNormalizedSearch, normalizeSearchText } from "@/lib/search/normalize";

export const AUTHOR_FRANCHISE_SUBMISSION_STATUSES = [
  "submitted",
  "rejected",
] as const;

export type AuthorFranchiseSubmissionStatus =
  (typeof AUTHOR_FRANCHISE_SUBMISSION_STATUSES)[number];
export type AuthorFranchiseSubmissionStatusFilter =
  AuthorFranchiseSubmissionStatus | "all";

export type AuthorFranchiseSubmissionFilterItem = {
  franchiseCode: string;
  franchiseOriginalTitle: string | null;
  franchiseTitle: string;
  publicationStatus: PublicationStatus;
  mediaItemCode?: string;
  mediaItemTitle?: string;
};

export function parseAuthorFranchiseSubmissionStatusFilter(value: string | undefined) {
  return AUTHOR_FRANCHISE_SUBMISSION_STATUSES.some((status) => status === value)
    ? (value as AuthorFranchiseSubmissionStatus)
    : "all";
}

export function filterAuthorFranchiseSubmissions<TItem extends AuthorFranchiseSubmissionFilterItem>(
  items: TItem[],
  filters: {
    searchQuery: string;
    status: AuthorFranchiseSubmissionStatusFilter;
  },
) {
  const normalizedSearchQuery = normalizeSearchText(filters.searchQuery);

  return items.filter((item) => {
    const isVisibleStatus = AUTHOR_FRANCHISE_SUBMISSION_STATUSES.some(
      (status) => status === item.publicationStatus,
    );
    const matchesStatus = filters.status === "all" || item.publicationStatus === filters.status;
    const matchesSearch =
      !normalizedSearchQuery ||
      matchesNormalizedSearch([
        item.franchiseTitle,
        item.franchiseOriginalTitle,
        item.franchiseCode,
        item.mediaItemTitle,
        item.mediaItemCode,
      ], normalizedSearchQuery);

    return isVisibleStatus && matchesStatus && matchesSearch;
  });
}
