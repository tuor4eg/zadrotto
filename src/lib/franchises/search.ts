import { normalizeSearchText } from "@/lib/search/normalize";

export function matchesFranchiseSearch(values: Array<string | null | undefined>, query: string) {
  const normalizedQuery = normalizeSearchText(query);

  if (!normalizedQuery) {
    return true;
  }

  const normalizedValue = normalizeSearchText(values.filter(Boolean).join(" "));

  return (
    normalizedValue.includes(normalizedQuery) ||
    normalizedValue.replaceAll(" ", "").includes(normalizedQuery.replaceAll(" ", ""))
  );
}
