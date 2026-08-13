export type RobloxSearchCandidate = {
  universeId: number;
  rootPlaceId: number | null;
  name: string;
  creatorId: number | null;
  creatorName: string | null;
  canonicalUrlPath: string | null;
};

export type RobloxProviderErrorCode =
  | "provider-rate-limit"
  | "provider-timeout"
  | "provider-unavailable"
  | "provider-invalid-response";

export class RobloxProviderError extends Error {
  readonly code: RobloxProviderErrorCode;
  readonly retryAfterSeconds: number | null;

  constructor(
    code: RobloxProviderErrorCode,
    message: string,
    options: { cause?: unknown; retryAfterSeconds?: number | null } = {},
  ) {
    super(message, { cause: options.cause });
    this.name = "RobloxProviderError";
    this.code = code;
    this.retryAfterSeconds = options.retryAfterSeconds ?? null;
  }
}

type RobloxSearchAdapterOptions = {
  fetch?: typeof fetch;
  now?: () => number;
  createSessionId?: () => string;
  timeoutMs?: number;
  cacheTtlMs?: number;
  defaultCooldownMs?: number;
};

type CachedSearch = {
  expiresAt: number;
  candidates: RobloxSearchCandidate[];
};

const SEARCH_URL = "https://apis.roblox.com/search-api/omni-search";
const DEFAULT_TIMEOUT_MS = 8_000;
const DEFAULT_CACHE_TTL_MS = 30_000;
const DEFAULT_COOLDOWN_MS = 60_000;

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function getPositiveInteger(value: unknown) {
  return typeof value === "number" && Number.isSafeInteger(value) && value > 0 ? value : null;
}

function getOptionalString(value: unknown) {
  return typeof value === "string" && value.trim() ? value.trim() : null;
}

function parseRetryAfterSeconds(value: string | null, now: number) {
  if (!value) return null;
  const seconds = Number(value);
  if (Number.isFinite(seconds) && seconds >= 0) return Math.ceil(seconds);
  const date = Date.parse(value);
  return Number.isFinite(date) ? Math.max(0, Math.ceil((date - now) / 1_000)) : null;
}

function parseCandidate(value: unknown): RobloxSearchCandidate | null {
  if (!isRecord(value)) return null;
  const universeId = getPositiveInteger(value.universeId);
  const name = getOptionalString(value.name);
  if (!universeId || !name) return null;

  return {
    universeId,
    rootPlaceId: getPositiveInteger(value.rootPlaceId),
    name,
    creatorId: getPositiveInteger(value.creatorId),
    creatorName: getOptionalString(value.creatorName),
    canonicalUrlPath: getOptionalString(value.canonicalUrlPath),
  };
}

function parseSearchResponse(value: unknown, limit: number) {
  if (!isRecord(value) || !Array.isArray(value.searchResults)) {
    throw new RobloxProviderError(
      "provider-invalid-response",
      "Roblox search returned an unexpected response.",
    );
  }

  const candidates: RobloxSearchCandidate[] = [];
  const seenUniverseIds = new Set<number>();

  for (const group of value.searchResults) {
    if (!isRecord(group) || group.contentGroupType !== "Game" || !Array.isArray(group.contents)) {
      continue;
    }

    for (const content of group.contents) {
      const candidate = parseCandidate(content);
      if (!candidate || seenUniverseIds.has(candidate.universeId)) continue;
      seenUniverseIds.add(candidate.universeId);
      candidates.push(candidate);
      if (candidates.length >= limit) return candidates;
    }
  }

  return candidates;
}

export class RobloxSearchAdapter {
  private readonly fetchImplementation: typeof fetch;
  private readonly now: () => number;
  private readonly createSessionId: () => string;
  private readonly timeoutMs: number;
  private readonly cacheTtlMs: number;
  private readonly defaultCooldownMs: number;
  private readonly cache = new Map<string, CachedSearch>();
  private readonly inFlight = new Map<string, Promise<RobloxSearchCandidate[]>>();
  private cooldownUntil = 0;

  constructor(options: RobloxSearchAdapterOptions = {}) {
    this.fetchImplementation = options.fetch ?? globalThis.fetch;
    this.now = options.now ?? Date.now;
    this.createSessionId = options.createSessionId ?? (() => crypto.randomUUID());
    this.timeoutMs = options.timeoutMs ?? DEFAULT_TIMEOUT_MS;
    this.cacheTtlMs = options.cacheTtlMs ?? DEFAULT_CACHE_TTL_MS;
    this.defaultCooldownMs = options.defaultCooldownMs ?? DEFAULT_COOLDOWN_MS;
  }

  async search(query: string, candidateLimit: number) {
    const normalizedQuery = query.trim().replace(/\s+/g, " ");
    const limit = Math.max(1, Math.floor(candidateLimit));
    if (!normalizedQuery) return [];

    const key = `${normalizedQuery.toLocaleLowerCase("ru-RU")}:${limit}`;
    const now = this.now();
    const cached = this.cache.get(key);
    if (cached && cached.expiresAt > now) return cached.candidates;

    if (this.cooldownUntil > now) {
      throw new RobloxProviderError("provider-rate-limit", "Roblox search is temporarily limited.", {
        retryAfterSeconds: Math.ceil((this.cooldownUntil - now) / 1_000),
      });
    }

    const currentRequest = this.inFlight.get(key);
    if (currentRequest) return currentRequest;

    const request = this.fetchCandidates(normalizedQuery, limit).then((candidates) => {
      this.cache.set(key, { candidates, expiresAt: this.now() + this.cacheTtlMs });
      return candidates;
    });
    this.inFlight.set(key, request);

    try {
      return await request;
    } finally {
      this.inFlight.delete(key);
    }
  }

  private async fetchCandidates(query: string, limit: number) {
    const url = new URL(SEARCH_URL);
    url.searchParams.set("searchQuery", query);
    url.searchParams.set("sessionId", this.createSessionId());
    url.searchParams.set("pageType", "all");

    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), this.timeoutMs);

    try {
      const response = await this.fetchImplementation(url, {
        headers: { accept: "application/json" },
        signal: controller.signal,
      });

      if (response.status === 429) {
        const now = this.now();
        const retryAfterSeconds = parseRetryAfterSeconds(response.headers.get("retry-after"), now);
        this.cooldownUntil = now + (retryAfterSeconds === null
          ? this.defaultCooldownMs
          : retryAfterSeconds * 1_000);
        throw new RobloxProviderError("provider-rate-limit", "Roblox search is temporarily limited.", {
          retryAfterSeconds: retryAfterSeconds ?? Math.ceil(this.defaultCooldownMs / 1_000),
        });
      }

      if (!response.ok) {
        throw new RobloxProviderError(
          "provider-unavailable",
          `Roblox search failed with HTTP ${response.status}.`,
        );
      }

      let data: unknown;
      try {
        data = await response.json();
      } catch (error) {
        throw new RobloxProviderError(
          "provider-invalid-response",
          "Roblox search returned invalid JSON.",
          { cause: error },
        );
      }

      return parseSearchResponse(data, limit);
    } catch (error) {
      if (error instanceof RobloxProviderError) throw error;
      if (controller.signal.aborted || (error instanceof DOMException && error.name === "AbortError")) {
        throw new RobloxProviderError("provider-timeout", "Roblox search timed out.", { cause: error });
      }
      throw new RobloxProviderError("provider-unavailable", "Roblox search is unavailable.", {
        cause: error,
      });
    } finally {
      clearTimeout(timeout);
    }
  }
}

export const robloxSearchAdapter = new RobloxSearchAdapter();
