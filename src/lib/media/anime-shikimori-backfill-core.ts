import type { AnimeShikimoriBackfillItem } from "@/db/queries/anime-shikimori-backfill";
import type { AniListShikimoriEnrichmentResult } from "@/lib/covers/providers/anilist";
import {
  hasCyrillicText,
} from "@/lib/media/anime-shikimori-language";
import { normalizeMediaItemTitleAliases } from "@/lib/media/title-aliases";
import { needsShikimoriDescriptionRefresh } from "@/lib/media/shikimori-description";

export function needsAnimeShikimoriEnrichment(item: Pick<AnimeShikimoriBackfillItem, "aliases" | "description">) {
  const needsAlias = !item.aliases.some(hasCyrillicText);
  return needsAlias || needsShikimoriDescriptionRefresh(item.description);
}

export function decideAnimeShikimoriBackfill(input: {
  aliases: readonly string[];
  description: string | null;
  maxTitleAliases: number;
  originalTitle: string | null;
  shikimoriDescription: string | null;
  shikimoriRussian: string | null;
  title: string;
}) {
  let aliases = [...input.aliases];

  if (!aliases.some(hasCyrillicText) && input.shikimoriRussian) {
    const withRussian = normalizeMediaItemTitleAliases([...aliases, input.shikimoriRussian], {
      originalTitle: input.originalTitle,
      title: input.title,
    });

    const normalizedExisting = normalizeMediaItemTitleAliases(aliases, {
      originalTitle: input.originalTitle,
      title: input.title,
    });

    if (withRussian.length > normalizedExisting.length) {
      aliases = aliases.length < input.maxTitleAliases
        ? withRussian
        : normalizeMediaItemTitleAliases(
            [...aliases.slice(0, -1), input.shikimoriRussian],
            { originalTitle: input.originalTitle, title: input.title },
          );
    }
  }

  const description = input.shikimoriDescription && needsShikimoriDescriptionRefresh(input.description)
    ? input.shikimoriDescription
    : input.description;

  return { aliases, description };
}

type LockedAnimeItem = {
  aliases: Array<{ id: number; value: string }>;
  description: string | null;
  id: number;
  originalTitle: string | null;
  title: string;
};

export type AnimeShikimoriBackfillDependencies = {
  applyResult: (input: {
    decide: (item: LockedAnimeItem) => { aliases: string[]; description: string | null };
    mediaItemId: number;
  }) => Promise<boolean>;
  fetchEnrichment: (anilistId: number) => Promise<AniListShikimoriEnrichmentResult>;
  getItems: () => Promise<AnimeShikimoriBackfillItem[]>;
  markSkipped: (input: {
    mediaItemId: number;
    shouldMark: (item: LockedAnimeItem) => boolean;
  }) => Promise<boolean>;
  maxTitleAliases: number;
};

export async function runAnimeShikimoriBackfill(
  dependencies: AnimeShikimoriBackfillDependencies,
) {
  const items = await dependencies.getItems();

  for (const item of items) {
    if (!needsAnimeShikimoriEnrichment(item)) {
      const marked = await dependencies.markSkipped({
        mediaItemId: item.id,
        shouldMark: (current) => !needsAnimeShikimoriEnrichment({
          aliases: current.aliases.map((alias) => alias.value),
          description: current.description,
        }),
      });
      if (marked) continue;
    }

    const result = await dependencies.fetchEnrichment(Number(item.sourceExternalId));
    if (result.kind === "transient-error") return { attemptedLookup: true, updated: false };

    const updated = await dependencies.applyResult({
      mediaItemId: item.id,
      decide: (current) => decideAnimeShikimoriBackfill({
        aliases: current.aliases.map((alias) => alias.value),
        description: current.description,
        maxTitleAliases: dependencies.maxTitleAliases,
        originalTitle: current.originalTitle,
        shikimoriDescription: result.description,
        shikimoriRussian: result.russian,
        title: current.title,
      }),
    });
    return { attemptedLookup: true, updated };
  }

  return { attemptedLookup: false, updated: false };
}
