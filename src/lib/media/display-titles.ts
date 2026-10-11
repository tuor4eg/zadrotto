import { hasCyrillicText } from "@/lib/media/anime-shikimori-language";
import { normalizeSearchText } from "@/lib/search/normalize";

type MediaItemDisplayTitlesInput = {
  title: string;
  originalTitle?: string | null;
  aliases?: readonly string[] | null;
};

export function resolveMediaItemDisplayTitles(input: MediaItemDisplayTitlesInput) {
  const title = input.title.trim();
  const aliases = (input.aliases ?? []).map((alias) => alias.trim()).filter(Boolean);
  const originalTitle = input.originalTitle?.trim() || null;
  const displayTitle = hasCyrillicText(title)
    ? title
    : aliases.find(hasCyrillicText)
      ?? (originalTitle && hasCyrillicText(originalTitle) ? originalTitle : title);
  const comparableTitle = normalizeSearchText(displayTitle);

  return {
    displayTitle,
    displayOriginalTitle: originalTitle && !hasCyrillicText(originalTitle)
      && normalizeSearchText(originalTitle) !== comparableTitle ? originalTitle : null,
    displayAliases: aliases.filter((alias) => normalizeSearchText(alias) !== comparableTitle),
  };
}
