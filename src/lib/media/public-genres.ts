import { compareCatalogAlphabetGroups, getCatalogAlphabetGroup } from "@/lib/common/catalog-alphabet";
import { clampPage, getOffset, getTotalPages } from "@/lib/common/pagination";
import type { MediaItemGenre } from "./genres";

export type PublicGenre = MediaItemGenre & { mediaItemsCount: number };

export function paginatePublicGenres(rows: readonly (PublicGenre & { nameMatches: boolean })[], input: {
  page: number; pageSize: number; letter?: string; searchQuery: string;
}) {
  const availableLetters = [...new Set(rows.map((genre) => getCatalogAlphabetGroup(genre.name)))].sort(compareCatalogAlphabetGroups);
  const selectedLetter = !input.searchQuery.trim() && input.letter && availableLetters.includes(input.letter) ? input.letter : undefined;
  const filtered = rows.filter((genre) => genre.nameMatches && (!selectedLetter || getCatalogAlphabetGroup(genre.name) === selectedLetter))
    .sort((a, b) => compareCatalogAlphabetGroups(getCatalogAlphabetGroup(a.name), getCatalogAlphabetGroup(b.name))
      || a.name.localeCompare(b.name, "ru-RU") || a.id - b.id);
  const totalPages = getTotalPages(filtered.length, input.pageSize);
  const page = clampPage(input.page, totalPages);
  return { items: filtered.slice(getOffset(page, input.pageSize), page * input.pageSize).map(({ id, slug, name, mediaItemsCount }) => ({ id, slug, name, mediaItemsCount })),
    page, pageSize: input.pageSize, paginationTotalCount: filtered.length, totalPages, availableLetters, selectedLetter };
}
