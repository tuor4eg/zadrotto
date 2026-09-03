import type { FranchiseBranchNode } from "@/db/queries/franchises";
import { matchesNormalizedSearch } from "@/lib/search/normalize";

export const CHILD_SERIES_PREVIEW_SIZE = 12;
export const MIN_HIDDEN_CHILD_SERIES = 6;

export function shouldShowAllChildSeries(totalCount: number) {
  return totalCount - CHILD_SERIES_PREVIEW_SIZE < MIN_HIDDEN_CHILD_SERIES;
}

export function getChildSeriesPreview<T>(children: readonly T[]) {
  return shouldShowAllChildSeries(children.length)
    ? [...children]
    : children.slice(0, CHILD_SERIES_PREVIEW_SIZE);
}

export function filterChildSeries(
  children: readonly FranchiseBranchNode[],
  searchQuery: string,
) {
  return children.filter((child) => matchesNormalizedSearch(
    [child.title, child.originalTitle],
    searchQuery,
  ));
}
