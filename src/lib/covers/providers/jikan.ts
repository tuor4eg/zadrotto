import type { CoverCandidate, CoverProvider } from "@/lib/covers/types";
import {
  buildUrl,
  COVER_SEARCH_LIMIT,
  fetchJson,
  normalizeSearchQuery,
} from "@/lib/covers/providers/shared";

type JikanSearchResponse = {
  data?: Array<{
    mal_id?: number;
    title?: string;
    title_english?: string | null;
    year?: number | null;
    url?: string;
    images?: {
      jpg?: {
        large_image_url?: string;
        image_url?: string;
      };
      webp?: {
        large_image_url?: string;
        image_url?: string;
      };
    };
  }>;
};

export const jikanProvider: CoverProvider = {
  code: "jikan",
  mediaTypes: ["anime"],
  async searchCoverCandidates(input) {
    const query = normalizeSearchQuery(input);

    if (!query) {
      return [];
    }

    const url = buildUrl("https://api.jikan.moe/v4/anime", {
      q: query,
      limit: COVER_SEARCH_LIMIT,
      sfw: true,
    });
    const data = await fetchJson<JikanSearchResponse>(url);

    const candidates: CoverCandidate[] = [];

    for (const item of data?.data ?? []) {
      const imageUrl =
        item.images?.webp?.large_image_url ??
        item.images?.jpg?.large_image_url ??
        item.images?.webp?.image_url ??
        item.images?.jpg?.image_url;

      if (!imageUrl || !item.mal_id) {
        continue;
      }

      candidates.push({
        id: `anime:${item.mal_id}`,
        provider: "jikan",
        title: item.title_english ?? item.title ?? query,
        imageUrl,
        sourcePageUrl: item.url ?? null,
        year: item.year ?? undefined,
      });
    }

    return candidates.slice(0, COVER_SEARCH_LIMIT);
  },
};
