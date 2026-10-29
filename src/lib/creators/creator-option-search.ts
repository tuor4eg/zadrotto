import { normalizeSearchText } from "@/lib/search/normalize";

export function matchesCreatorOptionName(person: { name: string; sourceName?: string | null; originalName?: string | null }, normalizedQuery: string) {
  return [person.name, person.sourceName, person.originalName].some(value => value != null && normalizeSearchText(value).includes(normalizedQuery));
}
