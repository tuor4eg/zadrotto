import {
  checkFixedWindowRateLimit,
  checkFixedWindowRateLimits,
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
  let unavailable = false;

  return {
    hasUnavailableLimitCheck() {
      return unavailable;
    },
    async canSearchProvider(providerCode: CoverProviderCode) {
      const result = await checkFixedWindowRateLimit({
        keyPrefix: "cover-search:provider",
        subject: providerCode,
        window: "day",
        limit: limitsByProviderCode.get(providerCode) ?? null,
      });

      if (!result.ok) {
        unavailable = true;
        return false;
      }

      return result.allowed;
    },
  };
}
