import {
  checkFixedWindowRateLimit,
  checkFixedWindowRateLimits,
  getFixedWindowRateLimitUsage,
} from "@/lib/rate-limits/redis";
import type { CoverProviderRateLimitValue } from "@/db/queries/cover-settings";
import type { CoverProviderCode } from "@/lib/covers/types";

export type CoverSearchRateLimitResult =
  | { ok: true }
  | {
      ok: false;
      status: 429 | 503;
      error: "author-rate-limit" | "rate-limit-unavailable";
      retryAfterSeconds?: number;
    };

export type AuthorCoverSearchLimits = {
  id: number;
  coverSearchesPerMinute: number | null;
  coverSearchesPerHour: number | null;
  coverSearchesPerDay: number | null;
};

export type ProviderCoverSearchRateLimitUsage = {
  providerCode: CoverProviderCode;
  used: number | null;
};

const PROVIDER_IMAGE_RELAY_REQUESTS_PER_MINUTE = 60;

export async function checkProviderImageRelayRateLimit(
  subject: string,
  checker = checkFixedWindowRateLimit,
) {
  const result = await checker({
    keyPrefix: "provider-image-relay",
    subject,
    window: "minute",
    limit: PROVIDER_IMAGE_RELAY_REQUESTS_PER_MINUTE,
  });

  // Preview images should remain available when Redis is temporarily unavailable.
  if (!result.ok) return { allowed: true, retryAfterSeconds: undefined };

  return {
    allowed: result.allowed,
    retryAfterSeconds: result.allowed ? undefined : result.retryAfterSeconds,
  };
}

export async function getProviderCoverSearchRateLimitUsage(
  rateLimits: readonly CoverProviderRateLimitValue[],
): Promise<ProviderCoverSearchRateLimitUsage[]> {
  return Promise.all(
    rateLimits.map(async (limit) => {
      const result = await getFixedWindowRateLimitUsage({
        keyPrefix: "cover-search:provider",
        subject: limit.providerCode,
        window: "day",
        limit: limit.searchesPerDay,
      });

      return {
        providerCode: limit.providerCode,
        used: result.ok ? result.used : null,
      };
    }),
  );
}

export async function checkAuthorCoverSearchRateLimit(
  author: AuthorCoverSearchLimits,
): Promise<CoverSearchRateLimitResult> {
  const result = await checkFixedWindowRateLimits(
    [
      {
        keyPrefix: "cover-search:author",
        subject: String(author.id),
        window: "minute",
        limit: author.coverSearchesPerMinute,
      },
      {
        keyPrefix: "cover-search:author",
        subject: String(author.id),
        window: "hour",
        limit: author.coverSearchesPerHour,
      },
      {
        keyPrefix: "cover-search:author",
        subject: String(author.id),
        window: "day",
        limit: author.coverSearchesPerDay,
      },
    ],
  );

  if (!result.ok) {
    return {
      ok: false,
      status: 503,
      error: "rate-limit-unavailable",
    };
  }

  if (!result.allowed) {
    return {
      ok: false,
      status: 429,
      error: "author-rate-limit",
      retryAfterSeconds: result.retryAfterSeconds,
    };
  }

  return { ok: true };
}

export function createProviderCoverSearchRateLimiter(
  rateLimits: readonly CoverProviderRateLimitValue[],
) {
  const limitsByProviderCode = new Map(
    rateLimits.map((limit) => [limit.providerCode, limit.searchesPerDay]),
  );
  let blockedError: "provider-daily-limit" | "rate-limit-unavailable" | null = null;

  return {
    getBlockedError() {
      return blockedError;
    },
    hasUnavailableLimitCheck() {
      return blockedError === "rate-limit-unavailable";
    },
    async canSearchProvider(providerCode: CoverProviderCode) {
      const result = await checkFixedWindowRateLimit({
        keyPrefix: "cover-search:provider",
        subject: providerCode,
        window: "day",
        limit: limitsByProviderCode.get(providerCode) ?? null,
      })

      if (!result.ok) {
        blockedError = "rate-limit-unavailable"
        return "rate-limit-unavailable" as const
      }

      if (!result.allowed) {
        blockedError ??= "provider-daily-limit"
        return "provider-daily-limit" as const
      }

      return true
    },
  }
}

export function wrapProviderSearchWithReserve(
  canSearchProvider: (providerCode: CoverProviderCode) => Promise<
    true | "provider-daily-limit" | "rate-limit-unavailable"
  >,
  rateLimits: readonly CoverProviderRateLimitValue[],
  quotaReserve: number,
  getUsage: typeof getFixedWindowRateLimitUsage = getFixedWindowRateLimitUsage,
) {
  const limitsByProviderCode = new Map(
    rateLimits.map((limit) => [limit.providerCode, limit.searchesPerDay]),
  )

  return async (providerCode: CoverProviderCode) => {
    const dailyLimit = limitsByProviderCode.get(providerCode)
    if (dailyLimit != null && quotaReserve > 0) {
      const usage = await getUsage({
        keyPrefix: "cover-search:provider",
        subject: providerCode,
        window: "day",
        limit: dailyLimit,
      })
      if (!usage.ok) return "rate-limit-unavailable" as const
      if (dailyLimit - usage.used <= quotaReserve) return "provider-daily-limit" as const
    }

    return canSearchProvider(providerCode)
  }
}
