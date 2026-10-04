import type { CoverCandidate, MediaProvider } from "@/lib/covers/types";
import { fetchJson, fetchSearchJson, normalizeSearchQuery } from "@/lib/covers/providers/shared";
import { normalizeSearchText } from "@/lib/search/normalize";
import { sanitizeShikimoriDescription } from "@/lib/media/shikimori-description";

type AniListMedia = {
  id?: number;
  idMal?: number | null;
  title?: {
    english?: string | null;
    romaji?: string | null;
    native?: string | null;
  };
  description?: string | null;
  coverImage?: {
    extraLarge?: string | null;
    large?: string | null;
    medium?: string | null;
  };
  siteUrl?: string | null;
  startDate?: {
    year?: number | null;
  } | null;
  seasonYear?: number | null;
  popularity?: number | null;
  episodes?: number | null;
  duration?: number | null;
  format?: string | null;
  genres?: string[] | null;
  status?: string | null;
  studios?: {
    nodes?: Array<{
      name?: string | null;
    }> | null;
  } | null;
};

type AniListResponse = {
  data?: {
    Page?: {
      media?: AniListMedia[];
    };
    Media?: AniListMedia | null;
  };
};

type ShikimoriResponse = {
  data?: {
    animes?: Array<{
      description?: string | null;
      malId?: number | string | null;
      name?: string | null;
      russian?: string | null;
    }> | null;
  };
  errors?: unknown;
};

const ANILIST_URL = new URL("https://graphql.anilist.co");
const SHIKIMORI_URL = new URL("https://shikimori.io/api/graphql");

const ANILIST_MEDIA_FIELDS = `
  id
  idMal
  title {
    english
    romaji
    native
  }
  description(asHtml: false)
  coverImage {
    extraLarge
    large
    medium
  }
  siteUrl
  startDate {
    year
  }
  seasonYear
  popularity
  episodes
  duration
  format
  genres
  status
  studios {
    nodes {
      name
    }
  }
`;

async function queryAniList(query: string, variables: Record<string, unknown>) {
  return fetchSearchJson<AniListResponse>(ANILIST_URL, {
    method: "POST",
    headers: {
      "content-type": "application/json",
    },
    body: JSON.stringify({ query, variables }),
  });
}

function getAniListTitle(item: AniListMedia, fallbackTitle: string) {
  return item.title?.english ?? item.title?.romaji ?? item.title?.native ?? fallbackTitle;
}

function getAniListOriginalTitle(item: AniListMedia, title: string) {
  const originalTitle = item.title?.romaji ?? item.title?.native ?? null;

  return originalTitle && originalTitle !== title ? originalTitle : null;
}

function getAniListImageUrl(item: AniListMedia) {
  return item.coverImage?.extraLarge ?? item.coverImage?.large ?? item.coverImage?.medium ?? null;
}

function getAniListReleaseYear(item: AniListMedia) {
  return item.seasonYear ?? item.startDate?.year ?? null;
}

function getUniqueAniListNames(values: Array<string | null | undefined> | null | undefined) {
  return [...new Set((values ?? []).map((value) => value?.trim()).filter(Boolean))];
}

function getAniListStudioNames(item: AniListMedia) {
  return getUniqueAniListNames(item.studios?.nodes?.map((studio) => studio.name));
}

async function searchAniListAnime(query: string, candidateLimit: number) {
  const response = await queryAniList(
    `query SearchAnime($search: String!, $perPage: Int!) {
      Page(page: 1, perPage: $perPage) {
        media(search: $search, type: ANIME) {
          ${ANILIST_MEDIA_FIELDS}
        }
      }
    }`,
    { search: query, perPage: candidateLimit },
  );

  return response?.data?.Page?.media ?? [];
}

async function getAniListAnime(id: number) {
  const response = await queryAniList(
    `query Anime($id: Int!) {
      Media(id: $id, type: ANIME) {
        ${ANILIST_MEDIA_FIELDS}
      }
    }`,
    { id },
  );

  return response?.data?.Media ?? null;
}

async function getAniListAnimeByMalId(malId: number) {
  const response = await queryAniList(
    `query AnimeByMalId($idMal: Int!) {
      Media(idMal: $idMal, type: ANIME) {
        ${ANILIST_MEDIA_FIELDS}
      }
    }`,
    { idMal: malId },
  );

  return response?.data?.Media ?? null;
}

async function findShikimoriMalId(query: string, candidateLimit: number) {
  try {
    const response = await fetchJson<ShikimoriResponse>(SHIKIMORI_URL, {
      method: "POST",
      headers: {
        "content-type": "application/json",
      },
      body: JSON.stringify({
        query: `query SearchAnime($search: String!, $limit: Int!) {
          animes(search: $search, limit: $limit) {
            malId
            name
            russian
          }
        }`,
        variables: { search: query, limit: candidateLimit },
      }),
    });

    if (!response || response.errors || !Array.isArray(response.data?.animes)) {
      return null;
    }

    const normalizedQuery = normalizeSearchText(query);
    const match = response.data.animes.find((anime) =>
      [anime?.name, anime?.russian].some(
        (title) => title && normalizeSearchText(title) === normalizedQuery,
      ),
    );
    const malId = Number(match?.malId);

    return Number.isInteger(malId) && malId > 0 ? malId : null;
  } catch {
    return null;
  }
}

async function searchAniListAnimeViaShikimori(query: string, candidateLimit: number) {
  const malId = await findShikimoriMalId(query, candidateLimit);

  if (!malId) return [];

  try {
    const media = await getAniListAnimeByMalId(malId);
    return media?.id ? [media] : [];
  } catch {
    return [];
  }
}

export type AniListShikimoriEnrichmentResult =
  | { kind: "transient-error" }
  | {
      kind: "terminal";
      description: string | null;
      russian: string | null;
      status: "enriched" | "no-mal-id" | "not-found";
    };

async function getShikimoriAnime(malId: number): Promise<AniListShikimoriEnrichmentResult> {
  try {
    const response = await fetchSearchJson<ShikimoriResponse>(SHIKIMORI_URL, {
      method: "POST",
      headers: {
        "content-type": "application/json",
      },
      body: JSON.stringify({
        query: `query AnimeByMalId($ids: String!) {
          animes(ids: $ids) {
            malId
            russian
            description
          }
        }`,
        variables: { ids: String(malId) },
      }),
    });

    if (response.errors || !Array.isArray(response.data?.animes)) {
      return { kind: "transient-error" };
    }

    const anime = response.data.animes.find((item) => String(item?.malId) === String(malId));

    if (!anime) {
      return { kind: "terminal", description: null, russian: null, status: "not-found" };
    }

    return {
      kind: "terminal",
      description: sanitizeShikimoriDescription(anime.description ?? "") || null,
      russian: anime.russian?.trim() || null,
      status: "enriched",
    };
  } catch {
    return { kind: "transient-error" };
  }
}

export async function getAniListShikimoriEnrichment(
  anilistId: number,
): Promise<AniListShikimoriEnrichmentResult> {
  if (!Number.isSafeInteger(anilistId) || anilistId <= 0) {
    return { kind: "terminal", description: null, russian: null, status: "not-found" };
  }

  let media: AniListMedia | null;

  try {
    media = await getAniListAnime(anilistId);
  } catch {
    return { kind: "transient-error" };
  }

  if (!media?.id) {
    return { kind: "terminal", description: null, russian: null, status: "not-found" };
  }

  if (!Number.isInteger(media.idMal) || media.idMal! <= 0) {
    return { kind: "terminal", description: null, russian: null, status: "no-mal-id" };
  }

  return getShikimoriAnime(media.idMal!);
}

export const anilistProvider: MediaProvider = {
  code: "anilist",
  mediaTypes: ["anime"],
  async searchTitleCandidates(input, options) {
    const query = normalizeSearchQuery(input);

    if (!query) {
      return [];
    }

    const anilistMedia = await searchAniListAnime(query, options.candidateLimit);
    const media = anilistMedia.length > 0
      ? anilistMedia
      : await searchAniListAnimeViaShikimori(query, options.candidateLimit);

    return media
      .filter((item) => item.id)
      .slice(0, options.candidateLimit)
      .map((item) => {
        const title = getAniListTitle(item, query);

        return {
          id: `anime:${item.id}`,
          provider: "anilist",
          externalId: String(item.id),
          mediaType: input.mediaType,
          title,
          originalTitle: getAniListOriginalTitle(item, title),
          description: item.description ?? null,
          coverUrl: getAniListImageUrl(item),
          sourcePageUrl: item.siteUrl ?? null,
          releaseYear: getAniListReleaseYear(item),
          confidence: item.popularity ?? undefined,
        };
      });
  },
  async getTitleMetadata(input, options) {
    const id = Number(input.externalId);

    if (!Number.isInteger(id) || id <= 0) {
      return null;
    }

    const media = await getAniListAnime(id);

    if (!media?.id) {
      return null;
    }

    const title = getAniListTitle(media, input.externalId);
    const shikimoriResult = options.enrichTitleFields && Number.isInteger(media.idMal) && media.idMal! > 0
      ? await getShikimoriAnime(media.idMal!)
      : null;
    const shikimori = shikimoriResult?.kind === "terminal" ? shikimoriResult : null;

    return {
      provider: "anilist",
      externalId: input.externalId,
      sourceUrl: media.siteUrl ?? null,
      facts: {
        episodeCount: media.episodes ?? null,
        status: media.status ?? null,
        animeType: media.format ?? null,
        averageEpisodeRuntimeMinutes: media.duration ?? null,
        genres: getUniqueAniListNames(media.genres),
        studios: getAniListStudioNames(media),
      },
      ...(options.enrichTitleFields
        ? { fields: {
            aliases: shikimori?.russian ? [shikimori.russian] : [],
            title,
            originalTitle: getAniListOriginalTitle(media, title),
            description: shikimori?.description ?? media.description ?? null,
            releaseYear: getAniListReleaseYear(media),
          } }
        : {}),
    };
  },
  async getCoverCandidatesByTitleSource(input) {
    const id = Number(input.titleSource?.externalId);

    if (!Number.isInteger(id) || id <= 0) {
      return [];
    }

    const media = await getAniListAnime(id);
    const imageUrl = media ? getAniListImageUrl(media) : null;

    if (!media?.id || !imageUrl) {
      return [];
    }

    return [{
      id: `anime:${media.id}`,
      provider: "anilist",
      title: getAniListTitle(media, input.title),
      imageUrl,
      sourcePageUrl: media.siteUrl ?? null,
      year: getAniListReleaseYear(media) ?? undefined,
    }];
  },
  async searchCoverCandidates(input, options) {
    const query = normalizeSearchQuery(input);

    if (!query) {
      return [];
    }

    const media = await searchAniListAnime(query, options.candidateLimit);
    const candidates: CoverCandidate[] = [];

    for (const item of media) {
      const imageUrl = getAniListImageUrl(item);

      if (!item.id || !imageUrl) {
        continue;
      }

      candidates.push({
        id: `anime:${item.id}`,
        provider: "anilist",
        title: getAniListTitle(item, query),
        imageUrl,
        sourcePageUrl: item.siteUrl ?? null,
        year: getAniListReleaseYear(item) ?? undefined,
        confidence: item.popularity ?? undefined,
      });
    }

    return candidates.slice(0, options.candidateLimit);
  },
};
