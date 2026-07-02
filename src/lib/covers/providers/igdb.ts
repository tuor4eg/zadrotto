import type { CoverCandidate, MediaProvider, MediaTitleCandidate } from "@/lib/covers/types";
import {
  fetchJson,
  getFirstYear,
  normalizeSearchQuery,
} from "@/lib/covers/providers/shared";

type TwitchTokenResponse = {
  access_token?: string;
  expires_in?: number;
  token_type?: string;
};

type IgdbGameResponse = Array<{
  id?: number;
  name?: string;
  slug?: string;
  url?: string;
  summary?: string;
  first_release_date?: number;
  rating?: number;
  total_rating?: number;
  cover?: {
    image_id?: string;
    width?: number;
    height?: number;
  };
  genres?: Array<{
    name?: string;
  }>;
  involved_companies?: Array<{
    developer?: boolean;
    publisher?: boolean;
    company?: {
      name?: string;
    };
  }>;
  platforms?: Array<{
    name?: string;
  }>;
}>;

let cachedToken: {
  accessToken: string;
  clientId: string;
  expiresAt: number;
} | null = null;

async function getIgdbAccessToken(credentials: { clientId: string; clientSecret: string }) {
  if (
    cachedToken &&
    cachedToken.clientId === credentials.clientId &&
    cachedToken.expiresAt > Date.now() + 60_000
  ) {
    return cachedToken.accessToken;
  }

  const url = new URL("https://id.twitch.tv/oauth2/token");

  url.searchParams.set("client_id", credentials.clientId);
  url.searchParams.set("client_secret", credentials.clientSecret);
  url.searchParams.set("grant_type", "client_credentials");

  const token = await fetchJson<TwitchTokenResponse>(url, { method: "POST" });

  if (!token?.access_token) {
    return null;
  }

  cachedToken = {
    accessToken: token.access_token,
    clientId: credentials.clientId,
    expiresAt: Date.now() + (token.expires_in ?? 3600) * 1000,
  };

  return cachedToken.accessToken;
}

function escapeIgdbSearchQuery(value: string) {
  return value.replace(/\\/g, "\\\\").replace(/"/g, '\\"');
}

function buildIgdbImageUrl(imageId: string) {
  return `https://images.igdb.com/igdb/image/upload/t_cover_big_2x/${imageId}.jpg`;
}

function getIgdbSourcePageUrl(game: { slug?: string; url?: string }) {
  return game.url ?? (game.slug ? `https://www.igdb.com/games/${game.slug}` : null);
}

function getIgdbYear(firstReleaseDate: number | undefined) {
  return getFirstYear(firstReleaseDate ? new Date(firstReleaseDate * 1000).toISOString() : null) ?? null;
}

function createIgdbClient(credentials: { clientId: string; clientSecret: string }) {
  async function fetchGames(body: string) {
    const accessToken = await getIgdbAccessToken(credentials);

    if (!accessToken) {
      return [];
    }

    const response = await fetch("https://api.igdb.com/v4/games", {
      method: "POST",
      headers: {
        accept: "application/json",
        "Client-ID": credentials.clientId,
        Authorization: `Bearer ${accessToken}`,
      },
      body,
    });

    if (!response.ok) {
      return [];
    }

    return (await response.json()) as IgdbGameResponse;
  }

  return {
    async searchGames(input: { query: string; limit: number; requireCover?: boolean }) {
      return fetchGames(
        [
          "fields name,summary,slug,url,first_release_date,rating,total_rating,cover.image_id,cover.width,cover.height;",
          `search "${escapeIgdbSearchQuery(input.query)}";`,
          input.requireCover ? "where cover != null;" : "",
          `limit ${input.limit};`,
        ]
          .filter(Boolean)
          .join(" "),
      );
    },
    async getGameMetadata(id: number) {
      const [game] = await fetchGames(
        [
          "fields genres.name,involved_companies.company.name,involved_companies.developer,involved_companies.publisher,platforms.name,slug,url;",
          `where id = ${id};`,
          "limit 1;",
        ].join(" "),
      );

      return game ?? null;
    },
  };
}

function getUniqueNames(values: Array<{ name?: string } | undefined> | undefined) {
  return [...new Set((values ?? []).map((value) => value?.name?.trim()).filter(Boolean))];
}

function getInvolvedCompanyNames(
  game: NonNullable<IgdbGameResponse[number]>,
  role: "developer" | "publisher",
) {
  return [
    ...new Set(
      (game.involved_companies ?? [])
        .filter((company) => company[role])
        .map((company) => company.company?.name?.trim())
        .filter(Boolean),
    ),
  ];
}

export const igdbProvider: MediaProvider = {
  code: "igdb",
  mediaTypes: ["game"],
  async searchTitleCandidates(input, options) {
    const clientId = options.providerCredentials?.igdb?.clientId?.trim();
    const clientSecret = options.providerCredentials?.igdb?.clientSecret?.trim();
    const credentials = clientId && clientSecret ? { clientId, clientSecret } : null;
    const query = normalizeSearchQuery(input);

    if (!credentials || !query) {
      return [];
    }

    const games = await createIgdbClient(credentials).searchGames({
      query,
      limit: options.candidateLimit,
    });
    const candidates: MediaTitleCandidate[] = [];

    for (const game of games) {
      if (!game.id) {
        continue;
      }

      const imageId = game.cover?.image_id;

      candidates.push({
        id: `game:${game.id}`,
        provider: "igdb",
        externalId: String(game.id),
        mediaType: input.mediaType,
        title: game.name ?? query,
        originalTitle: null,
        description: game.summary ?? null,
        coverUrl: imageId ? buildIgdbImageUrl(imageId) : null,
        sourcePageUrl: getIgdbSourcePageUrl(game),
        releaseYear: getIgdbYear(game.first_release_date),
        confidence: game.total_rating ?? game.rating,
      });
    }

    return candidates.slice(0, options.candidateLimit);
  },
  async getTitleMetadata(input, options) {
    const clientId = options.providerCredentials?.igdb?.clientId?.trim();
    const clientSecret = options.providerCredentials?.igdb?.clientSecret?.trim();
    const credentials = clientId && clientSecret ? { clientId, clientSecret } : null;
    const id = Number(input.externalId);

    if (!credentials || !Number.isInteger(id) || id <= 0) {
      return null;
    }

    const game = await createIgdbClient(credentials).getGameMetadata(id);

    if (!game) {
      return null;
    }

    return {
      provider: "igdb",
      externalId: input.externalId,
      sourceUrl: getIgdbSourcePageUrl(game),
      facts: {
        platforms: getUniqueNames(game.platforms),
        developers: getInvolvedCompanyNames(game, "developer"),
        publishers: getInvolvedCompanyNames(game, "publisher"),
        genres: getUniqueNames(game.genres),
      },
    };
  },
  async searchCoverCandidates(input, options) {
    const clientId = options.providerCredentials?.igdb?.clientId?.trim();
    const clientSecret = options.providerCredentials?.igdb?.clientSecret?.trim();
    const credentials = clientId && clientSecret ? { clientId, clientSecret } : null;
    const query = normalizeSearchQuery(input);

    if (!credentials || !query) {
      return [];
    }

    const games = await createIgdbClient(credentials).searchGames({
      query,
      limit: options.candidateLimit,
      requireCover: true,
    });
    const candidates: CoverCandidate[] = [];

    for (const game of games) {
      const imageId = game.cover?.image_id;

      if (!game.id || !imageId) {
        continue;
      }

      candidates.push({
        id: `game:${game.id}:${imageId}`,
        provider: "igdb",
        title: game.name ?? query,
        imageUrl: buildIgdbImageUrl(imageId),
        sourcePageUrl: getIgdbSourcePageUrl(game),
        width: game.cover?.width,
        height: game.cover?.height,
        year: getIgdbYear(game.first_release_date) ?? undefined,
        confidence: game.total_rating ?? game.rating,
      });
    }

    return candidates.slice(0, options.candidateLimit);
  },
};
