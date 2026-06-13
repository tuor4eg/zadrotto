import type { CoverCandidate, CoverProvider } from "@/lib/covers/types";
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
  first_release_date?: number;
  rating?: number;
  total_rating?: number;
  cover?: {
    image_id?: string;
    width?: number;
    height?: number;
  };
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
  return getFirstYear(firstReleaseDate ? new Date(firstReleaseDate * 1000).toISOString() : null);
}

export const igdbProvider: CoverProvider = {
  code: "igdb",
  mediaTypes: ["game"],
  async searchCoverCandidates(input, options) {
    const clientId = options.providerCredentials?.igdb?.clientId?.trim();
    const clientSecret = options.providerCredentials?.igdb?.clientSecret?.trim();
    const credentials = clientId && clientSecret ? { clientId, clientSecret } : null;
    const query = normalizeSearchQuery(input);

    if (!credentials || !query) {
      return [];
    }

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
      body: [
        "fields name,slug,url,first_release_date,rating,total_rating,cover.image_id,cover.width,cover.height;",
        `search "${escapeIgdbSearchQuery(query)}";`,
        "where cover != null;",
        `limit ${options.candidateLimit};`,
      ].join(" "),
    });

    if (!response.ok) {
      return [];
    }

    const games = (await response.json()) as IgdbGameResponse;
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
        year: getIgdbYear(game.first_release_date),
        confidence: game.total_rating ?? game.rating,
      });
    }

    return candidates.slice(0, options.candidateLimit);
  },
};
