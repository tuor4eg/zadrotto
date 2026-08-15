import { DEFAULT_TMDB_COVER_RESULT_SCAN_LIMIT } from "@/lib/covers/config";
import { coverProviderRequiresCredentials } from "@/lib/covers/credential-definitions";
import { COVER_PROVIDERS } from "@/lib/covers/providers";
import { ProviderHttpError } from "@/lib/covers/providers/shared";
import type { CoverProviderCode, MediaProvider } from "@/lib/covers/types";
import type { MediaType } from "@/lib/media/types";

export const COVER_PROVIDER_SMOKE_TEST_TIMEOUT_MS = 15_000;

const TEST_QUERIES_BY_MEDIA_TYPE: Record<string, string> = {
  film: "Star Wars",
  series: "Breaking Bad",
  anime: "Cowboy Bebop",
  comic: "Batman",
  book: "Гарри Поттер",
  game: "The Witcher 3",
  roblox: "Adopt Me",
};

export type CoverProviderSmokeTestResult =
  | {
      ok: true;
      candidateTitle: string | null;
      latencyMs: number;
    }
  | {
      ok: false;
      error: "invalid-provider" | "missing-credentials" | "timeout" | "invalid-credentials" | "rate-limited" | "unavailable";
      httpStatus: number | null;
      latencyMs: number | null;
      providerMessage: string | null;
    };

type SmokeTestDependencies = {
  now?: () => number;
  providers?: readonly MediaProvider[];
  timeoutMs?: number;
};

class CoverProviderSmokeTestTimeoutError extends Error {}

function getTestQuery(mediaType: MediaType) {
  return TEST_QUERIES_BY_MEDIA_TYPE[mediaType] ?? "test";
}

function getErrorCode(error: unknown, requiresCredentials: boolean): Extract<CoverProviderSmokeTestResult, { ok: false }> ["error"] {
  if (error instanceof CoverProviderSmokeTestTimeoutError) return "timeout";

  const message = error instanceof Error ? error.message : "";
  if (message.includes("HTTP 401") || (requiresCredentials && message.includes("HTTP 403"))) {
    return "invalid-credentials";
  }
  if (message.includes("HTTP 429") || message.includes("rate-limit")) return "rate-limited";

  return "unavailable";
}

function getHttpErrorDetails(error: unknown) {
  if (error instanceof ProviderHttpError) {
    return { httpStatus: error.status, providerMessage: error.providerMessage };
  }

  const message = error instanceof Error ? error.message : "";
  const statusMatch = message.match(/HTTP (\d{3})/);

  return {
    httpStatus: statusMatch ? Number(statusMatch[1]) : null,
    providerMessage: message ? message.trim().slice(0, 500) : null,
  };
}

async function runWithTimeout<T>(operation: Promise<T>, timeoutMs: number) {
  let timer: ReturnType<typeof setTimeout> | undefined;
  const timeout = new Promise<never>((_, reject) => {
    timer = setTimeout(() => reject(new CoverProviderSmokeTestTimeoutError()), timeoutMs);
  });

  try {
    return await Promise.race([operation, timeout]);
  } finally {
    if (timer) clearTimeout(timer);
  }
}

export async function runCoverProviderSmokeTest(input: {
  providerCode: CoverProviderCode;
  mediaType: MediaType;
  providerCredentials: Partial<Record<CoverProviderCode, Record<string, string>>>;
}, dependencies: SmokeTestDependencies = {}): Promise<CoverProviderSmokeTestResult> {
  const now = dependencies.now ?? Date.now;
  const providers = dependencies.providers ?? COVER_PROVIDERS;
  const provider = providers.find(
    (candidate) => candidate.code === input.providerCode && candidate.mediaTypes.includes(input.mediaType),
  );

  if (!provider?.searchTitleCandidates) {
    return {
      ok: false,
      error: "invalid-provider",
      httpStatus: null,
      latencyMs: null,
      providerMessage: null,
    };
  }

  if (coverProviderRequiresCredentials(input.providerCode) && !input.providerCredentials[input.providerCode]) {
    return {
      ok: false,
      error: "missing-credentials",
      httpStatus: null,
      latencyMs: null,
      providerMessage: null,
    };
  }

  const startedAt = now();
  try {
    const candidates = await runWithTimeout(
      provider.searchTitleCandidates(
        { query: getTestQuery(input.mediaType), mediaType: input.mediaType },
        {
          candidateLimit: 1,
          tmdbResultScanLimit: DEFAULT_TMDB_COVER_RESULT_SCAN_LIMIT,
          providerCredentials: input.providerCredentials,
        },
      ),
      dependencies.timeoutMs ?? COVER_PROVIDER_SMOKE_TEST_TIMEOUT_MS,
    );

    return {
      ok: true,
      candidateTitle: candidates[0]?.title ?? null,
      latencyMs: now() - startedAt,
    };
  } catch (error) {
    const details = getHttpErrorDetails(error);

    return {
      ok: false,
      error: getErrorCode(error, coverProviderRequiresCredentials(input.providerCode)),
      ...details,
      latencyMs: now() - startedAt,
    };
  }
}
