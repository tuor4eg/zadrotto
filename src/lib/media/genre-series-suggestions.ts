import type { SearchableFranchiseOption } from "@/components/ui/searchable-franchise-select";

export function getAvailableGenreSeriesSuggestions(
  suggestedIds: readonly number[],
  options: readonly SearchableFranchiseOption[],
  selectedIds: readonly string[],
) {
  const suggested = new Set(suggestedIds);
  const selected = new Set(selectedIds);
  return options.filter((option) => suggested.has(option.id)
    && option.publicationStatus === "published"
    && !option.disabled && !selected.has(String(option.id)));
}

export function appendGenreSeriesSuggestions(
  selectedIds: string[],
  suggestedIds: readonly number[],
  options: readonly SearchableFranchiseOption[],
) {
  const additions = getAvailableGenreSeriesSuggestions(suggestedIds, options, selectedIds);
  return additions.length > 0 ? [...selectedIds, ...additions.map((series) => String(series.id))] : selectedIds;
}
