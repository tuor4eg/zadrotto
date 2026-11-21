import { compareCatalogAlphabetGroups, getCatalogAlphabetGroup } from "@/lib/common/catalog-alphabet";
import { clampPage, getOffset, getTotalPages } from "@/lib/common/pagination";

export type PublicTag = { id: number; code: string; title: string } & { mediaItemsCount: number };

export function paginatePublicTags(rows: readonly (PublicTag & { nameMatches: boolean })[], input: {
  page: number; pageSize: number; letter?: string; searchQuery: string;
}) {
  const availableLetters = [...new Set(rows.map((tag) => getCatalogAlphabetGroup(tag.title)))].sort(compareCatalogAlphabetGroups);
  const selectedLetter = !input.searchQuery.trim() && input.letter && availableLetters.includes(input.letter) ? input.letter : undefined;
  const filtered = rows.filter((tag) => tag.nameMatches && (!selectedLetter || getCatalogAlphabetGroup(tag.title) === selectedLetter))
    .sort((a, b) => compareCatalogAlphabetGroups(getCatalogAlphabetGroup(a.title), getCatalogAlphabetGroup(b.title))
      || a.title.localeCompare(b.title, "ru-RU") || a.id - b.id);
  const totalPages = getTotalPages(filtered.length, input.pageSize);
  const page = clampPage(input.page, totalPages);
  return { items: filtered.slice(getOffset(page, input.pageSize), page * input.pageSize).map(({ id, code, title, mediaItemsCount }) => ({ id, code, title, mediaItemsCount })),
    page, pageSize: input.pageSize, paginationTotalCount: filtered.length, totalPages, availableLetters, selectedLetter };
}
