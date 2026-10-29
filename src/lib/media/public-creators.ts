import { compareCatalogAlphabetGroups, getCatalogAlphabetGroup } from "@/lib/common/catalog-alphabet";
import { clampPage, getOffset, getTotalPages } from "@/lib/common/pagination";


export type PublicCreator = { id: number; name: string; slug: string; roles?: { code: string; name: string }[]; avatarObjectKey?: string | null } & { mediaItemsCount: number };

export function paginatePublicCreators(rows: readonly (PublicCreator & { nameMatches: boolean })[], input: {
  page: number; pageSize: number; letter?: string; roles?: readonly string[]; searchQuery: string;
}) {
  rows = input.roles?.length ? rows.filter(creator => creator.roles?.some(role => input.roles!.includes(role.code))) : rows;
  const availableLetters = [...new Set(rows.map((creator) => getCatalogAlphabetGroup(creator.name)))].sort(compareCatalogAlphabetGroups);
  const selectedLetter = !input.searchQuery.trim() && input.letter && availableLetters.includes(input.letter) ? input.letter : undefined;
  const filtered = rows.filter((creator) => creator.nameMatches && (!selectedLetter || getCatalogAlphabetGroup(creator.name) === selectedLetter))
    .sort((a, b) => compareCatalogAlphabetGroups(getCatalogAlphabetGroup(a.name), getCatalogAlphabetGroup(b.name))
      || a.name.localeCompare(b.name, "ru-RU") || a.id - b.id);
  const totalPages = getTotalPages(filtered.length, input.pageSize);
  const page = clampPage(input.page, totalPages);
  return { items: filtered.slice(getOffset(page, input.pageSize), page * input.pageSize).map(({ id, slug, name, mediaItemsCount, avatarObjectKey, roles }) => ({ id, slug, name, mediaItemsCount, roles: roles ?? [], avatarObjectKey: avatarObjectKey ?? null })),
    page, pageSize: input.pageSize, paginationTotalCount: filtered.length, totalPages, availableLetters, selectedLetter };
}
