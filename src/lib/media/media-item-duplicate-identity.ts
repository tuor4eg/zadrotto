import type { MediaType } from "./types";
import { normalizeSearchText } from "@/lib/search/normalize";

export type MediaItemDuplicateIdentity = {
  mediaType: MediaType;
  title: string;
  originalTitle: string | null;
  aliases?: string[];
  releaseYear: number | null;
};

function normalizedAliases(aliases: string[] | undefined) {
  return [...new Set((aliases ?? []).map(normalizeSearchText).filter(Boolean))].sort();
}

export function hasMediaItemDuplicateIdentityChanged(
  previous: MediaItemDuplicateIdentity,
  next: MediaItemDuplicateIdentity,
) {
  return previous.mediaType !== next.mediaType ||
    previous.releaseYear !== next.releaseYear ||
    normalizeSearchText(previous.title) !== normalizeSearchText(next.title) ||
    normalizeSearchText(previous.originalTitle ?? "") !== normalizeSearchText(next.originalTitle ?? "") ||
    JSON.stringify(normalizedAliases(previous.aliases)) !== JSON.stringify(normalizedAliases(next.aliases));
}
