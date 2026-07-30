import { checkFixedWindowRateLimits } from "@/lib/rate-limits/redis";

export async function checkAuthorAiScenarioRateLimit(authorId: number) {
  const result = await checkFixedWindowRateLimits([
    {
      keyPrefix: "ai-scenario:author",
      subject: String(authorId),
      window: "minute",
      limit: 5,
    },
    {
      keyPrefix: "ai-scenario:author",
      subject: String(authorId),
      window: "day",
      limit: 50,
    },
  ]);

  if (!result.ok) {
    return {
      ok: false as const,
      status: 503 as const,
      error: "rate-limit-unavailable",
      retryAfterSeconds: undefined,
    };
  }
  if (!result.allowed) {
    return {
      ok: false as const,
      status: 429 as const,
      error: "author-rate-limit",
      retryAfterSeconds: result.retryAfterSeconds,
    };
  }
  return { ok: true as const };
}
