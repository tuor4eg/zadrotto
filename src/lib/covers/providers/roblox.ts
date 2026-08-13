import type {
  CoverCandidate,
  MediaProvider,
  MediaTitleCandidate,
} from "@/lib/covers/types";
import {
  RobloxProviderError,
  robloxSearchAdapter,
  type RobloxSearchCandidate,
} from "@/lib/covers/providers/roblox-search-adapter";

type RobloxGame = {
  id?: number;
  rootPlaceId?: number;
  name?: string;
  description?: string;
  creator?: { id?: number; name?: string; type?: string };
  created?: string;
  updated?: string;
  genre?: string;
  genre_l1?: string;
  genre_l2?: string;
};

type RobloxThumbnail = {
  targetId?: number;
  state?: string;
  imageUrl?: string;
  version?: string;
};
type RobloxGameThumbnailsResponse = {
  data?: Array<{ universeId?: number; thumbnails?: RobloxThumbnail[] }>;
};

type RobloxProviderDependencies = {
  fetch?: typeof fetch;
  searchAdapter?: Pick<typeof robloxSearchAdapter, "search">;
  timeoutMs?: number;
};

const API_TIMEOUT_MS = 8_000;
const ICON_SIZE = "512x512";
const THUMBNAIL_SIZE = "768x432";

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function isPositiveInteger(value: unknown): value is number {
  return typeof value === "number" && Number.isSafeInteger(value) && value > 0;
}

function parseUniverseId(value: string | undefined) {
  const id = Number(value);
  return isPositiveInteger(id) ? id : null;
}

function getSourceUrl(rootPlaceId: number | null | undefined) {
  return isPositiveInteger(rootPlaceId) ? `https://www.roblox.com/games/${rootPlaceId}` : null;
}

function getCandidateSourceUrl(candidate: RobloxSearchCandidate) {
  if (candidate.canonicalUrlPath) {
    try {
      return new URL(candidate.canonicalUrlPath, "https://www.roblox.com").toString();
    } catch {
      // Fall through to the stable root Place URL.
    }
  }
  return getSourceUrl(candidate.rootPlaceId);
}

async function fetchRobloxJson(
  fetchImplementation: typeof fetch,
  url: URL,
  timeoutMs: number,
): Promise<unknown> {
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), timeoutMs);
  try {
    const response = await fetchImplementation(url, {
      headers: { accept: "application/json" },
      signal: controller.signal,
    });
    if (response.status === 429) {
      const retryAfter = Number(response.headers.get("retry-after"));
      throw new RobloxProviderError("provider-rate-limit", "Roblox API is temporarily limited.", {
        retryAfterSeconds: Number.isFinite(retryAfter) && retryAfter >= 0 ? Math.ceil(retryAfter) : null,
      });
    }
    if (!response.ok) {
      throw new RobloxProviderError(
        "provider-unavailable",
        `Roblox API failed with HTTP ${response.status}.`,
      );
    }
    try {
      return await response.json();
    } catch (error) {
      throw new RobloxProviderError(
        "provider-invalid-response",
        "Roblox API returned invalid JSON.",
        { cause: error },
      );
    }
  } catch (error) {
    if (error instanceof RobloxProviderError) throw error;
    if (controller.signal.aborted || (error instanceof DOMException && error.name === "AbortError")) {
      throw new RobloxProviderError("provider-timeout", "Roblox API timed out.", { cause: error });
    }
    throw new RobloxProviderError("provider-unavailable", "Roblox API is unavailable.", {
      cause: error,
    });
  } finally {
    clearTimeout(timeout);
  }
}

function parseGamesResponse(value: unknown): RobloxGame[] {
  if (!isRecord(value) || !Array.isArray(value.data)) {
    throw new RobloxProviderError(
      "provider-invalid-response",
      "Roblox games API returned an unexpected response.",
    );
  }
  return value.data.filter((item): item is RobloxGame => isRecord(item));
}

function parseIconsResponse(value: unknown) {
  if (!isRecord(value) || !Array.isArray(value.data)) {
    throw new RobloxProviderError(
      "provider-invalid-response",
      "Roblox thumbnails API returned an unexpected response.",
    );
  }
  const icons = new Map<number, RobloxThumbnail>();
  for (const item of value.data) {
    if (!isRecord(item) || !isPositiveInteger(item.targetId)) continue;
    icons.set(item.targetId, item as RobloxThumbnail);
  }
  return icons;
}

function isReadyThumbnail(value: RobloxThumbnail) {
  return value.state === "Completed" && typeof value.imageUrl === "string" && value.imageUrl.length > 0;
}

function buildIconsUrl(universeIds: readonly number[]) {
  const url = new URL("https://thumbnails.roblox.com/v1/games/icons");
  url.searchParams.set("universeIds", universeIds.join(","));
  url.searchParams.set("returnPolicy", "PlaceHolder");
  url.searchParams.set("size", ICON_SIZE);
  url.searchParams.set("format", "Png");
  url.searchParams.set("isCircular", "false");
  return url;
}

function buildGameThumbnailsUrl(universeId: number, count: number) {
  const url = new URL("https://thumbnails.roblox.com/v1/games/multiget/thumbnails");
  url.searchParams.set("universeIds", String(universeId));
  url.searchParams.set("countPerUniverse", String(Math.min(10, Math.max(1, count))));
  url.searchParams.set("defaults", "true");
  url.searchParams.set("size", THUMBNAIL_SIZE);
  url.searchParams.set("format", "Png");
  url.searchParams.set("isCircular", "false");
  return url;
}

export function createRobloxProvider(dependencies: RobloxProviderDependencies = {}): MediaProvider {
  const fetchImplementation = dependencies.fetch ?? globalThis.fetch;
  const searchAdapter = dependencies.searchAdapter ?? robloxSearchAdapter;
  const timeoutMs = dependencies.timeoutMs ?? API_TIMEOUT_MS;

  return {
    code: "roblox",
    mediaTypes: ["roblox"],
    async searchTitleCandidates(input, options) {
      const query = input.query.trim().replace(/\s+/g, " ");
      if (!query) return [];

      const found = await searchAdapter.search(query, options.candidateLimit);
      let icons = new Map<number, RobloxThumbnail>();
      if (found.length > 0) {
        try {
          icons = parseIconsResponse(
            await fetchRobloxJson(
              fetchImplementation,
              buildIconsUrl(found.map((candidate) => candidate.universeId)),
              timeoutMs,
            ),
          );
        } catch {
          // Icons are optional for discovery and must not hide valid search candidates.
        }
      }

      return found.map<MediaTitleCandidate>((candidate) => {
        const icon = icons.get(candidate.universeId);
        return {
          id: `universe:${candidate.universeId}`,
          provider: "roblox",
          externalId: String(candidate.universeId),
          mediaType: input.mediaType,
          title: candidate.name,
          originalTitle: null,
          description: null,
          coverUrl: icon && isReadyThumbnail(icon) ? icon.imageUrl! : null,
          sourcePageUrl: getCandidateSourceUrl(candidate),
          releaseYear: null,
          subtitle: candidate.creatorName,
        };
      });
    },
    async getTitleMetadata(input) {
      const universeId = parseUniverseId(input.externalId);
      if (!universeId) return null;
      const url = new URL("https://games.roblox.com/v1/games");
      url.searchParams.set("universeIds", String(universeId));
      const games = parseGamesResponse(await fetchRobloxJson(fetchImplementation, url, timeoutMs));
      const game = games.find((item) => item.id === universeId);
      if (!game || !isPositiveInteger(game.rootPlaceId)) return null;

      return {
        provider: "roblox",
        externalId: String(universeId),
        sourceUrl: getSourceUrl(game.rootPlaceId),
        fields: {
          title: typeof game.name === "string" && game.name.trim() ? game.name.trim() : null,
          originalTitle: null,
          description:
            typeof game.description === "string" && game.description.trim()
              ? game.description.trim()
              : null,
          releaseYear: null,
        },
        facts: {
          universeId,
          rootPlaceId: game.rootPlaceId,
          creatorId: isPositiveInteger(game.creator?.id) ? game.creator.id : null,
          creatorName: game.creator?.name?.trim() || null,
          creatorType: game.creator?.type?.trim() || null,
          createdAt: game.created ?? null,
          updatedAt: game.updated ?? null,
          genre: game.genre?.trim() || null,
          genreLevel1: game.genre_l1?.trim() || null,
          genreLevel2: game.genre_l2?.trim() || null,
        },
      };
    },
    async getCoverCandidatesByTitleSource(input, options) {
      const universeId = parseUniverseId(input.titleSource?.externalId);
      if (!universeId) return [];

      const gamesUrl = new URL("https://games.roblox.com/v1/games");
      gamesUrl.searchParams.set("universeIds", String(universeId));
      const gamesValue = await fetchRobloxJson(fetchImplementation, gamesUrl, timeoutMs);
      const game = parseGamesResponse(gamesValue).find((item) => item.id === universeId);
      if (!game || !isPositiveInteger(game.rootPlaceId)) return [];
      // Keep the public APIs sequential: Roblox does not publish dependable limits for this flow.
      const iconsValue = await fetchRobloxJson(
        fetchImplementation,
        buildIconsUrl([universeId]),
        timeoutMs,
      );
      const thumbnailsValue = await fetchRobloxJson(
        fetchImplementation,
        buildGameThumbnailsUrl(universeId, options.candidateLimit),
        timeoutMs,
      );
      const sourcePageUrl = getSourceUrl(game.rootPlaceId);
      const title = game.name?.trim() || input.title;
      const candidates: CoverCandidate[] = [];
      const icon = parseIconsResponse(iconsValue).get(universeId);
      if (icon && isReadyThumbnail(icon)) {
        candidates.push({
          id: `universe:${universeId}:icon:${icon.version ?? "current"}`,
          provider: "roblox",
          title,
          imageUrl: icon.imageUrl!,
          sourcePageUrl,
          width: 512,
          height: 512,
        });
      }

      if (!isRecord(thumbnailsValue) || !Array.isArray(thumbnailsValue.data)) {
        throw new RobloxProviderError(
          "provider-invalid-response",
          "Roblox game thumbnails API returned an unexpected response.",
        );
      }
      const thumbnailGroup = (thumbnailsValue as RobloxGameThumbnailsResponse).data?.find(
        (item) => item.universeId === universeId,
      );
      for (const [index, thumbnail] of (thumbnailGroup?.thumbnails ?? []).entries()) {
        if (!isReadyThumbnail(thumbnail)) continue;
        candidates.push({
          id: `universe:${universeId}:thumbnail:${thumbnail.targetId ?? index}:${thumbnail.version ?? "current"}`,
          provider: "roblox",
          title,
          imageUrl: thumbnail.imageUrl!,
          sourcePageUrl,
          width: 768,
          height: 432,
        });
      }
      return candidates.slice(0, options.candidateLimit);
    },
  };
}

export const robloxProvider = createRobloxProvider();
