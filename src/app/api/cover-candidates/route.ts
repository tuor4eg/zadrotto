import { NextResponse } from "next/server";

import {
  getCoverProviderCredentialsForSearch,
  getCoverProviderRateLimits,
  getCoverProviderSettings,
  getCoverSettings,
} from "@/db/queries/cover-settings";
import { getCurrentAdminUser } from "@/lib/auth/admin-auth";
import { getCurrentAuthor } from "@/lib/auth/author-auth";
import { createCoverCandidateToken } from "@/lib/covers/candidates";
import {
  checkAuthorCoverSearchRateLimit,
  createProviderCoverSearchRateLimiter,
} from "@/lib/covers/rate-limits";
import { searchCoverCandidates } from "@/lib/covers/registry";
import { isCoverProviderCode } from "@/lib/covers/types";
import { isMediaTypeCode } from "@/lib/media/types";

type CoverCandidatesRequestBody = {
  title?: unknown;
  originalTitle?: unknown;
  mediaType?: unknown;
  releaseYear?: unknown;
  titleSource?: unknown;
};

function normalizeOptionalString(value: unknown) {
  return typeof value === "string" && value.trim() ? value.trim() : null;
}

function normalizeReleaseYear(value: unknown) {
  if (value === null || value === undefined || (typeof value === "string" && !value.trim())) {
    return null;
  }

  const year = typeof value === "number" ? value : Number(value);
  return Number.isInteger(year) && year >= 0 && year <= 9999 ? year : null;
}

function normalizeTitleSource(value: unknown) {
  if (!value || typeof value !== "object") return null;
  const source = value as { provider?: unknown; externalId?: unknown };
  const provider = normalizeOptionalString(source.provider);
  const externalId = normalizeOptionalString(source.externalId);
  return provider && externalId && isCoverProviderCode(provider) ? { provider, externalId } : null;
}

export async function POST(request: Request) {
  const [adminUser, author] = await Promise.all([getCurrentAdminUser(), getCurrentAuthor()]);

  if (!adminUser && !author) {
    return NextResponse.json({ candidates: [] }, { status: 401 });
  }

  const body = (await request.json().catch(() => ({}))) as CoverCandidatesRequestBody;
  const title = normalizeOptionalString(body.title) ?? "";
  const originalTitle = normalizeOptionalString(body.originalTitle);
  const mediaType = normalizeOptionalString(body.mediaType);
  const titleSource = normalizeTitleSource(body.titleSource);

  if (!mediaType || !isMediaTypeCode(mediaType) || (!titleSource && !title && !originalTitle)) {
    return NextResponse.json({ candidates: [] });
  }

  if (author && !adminUser) {
    const rateLimit = await checkAuthorCoverSearchRateLimit(author);

    if (!rateLimit.ok) {
      return NextResponse.json(
        {
          candidates: [],
          error: rateLimit.error,
          retryAfterSeconds: rateLimit.retryAfterSeconds,
        },
        { status: rateLimit.status },
      );
    }
  }

  const [coverSettings, providerSettings, providerRateLimits, providerCredentials] = await Promise.all([
    getCoverSettings(),
    getCoverProviderSettings(),
    getCoverProviderRateLimits(),
    getCoverProviderCredentialsForSearch(),
  ]);
  const providerRateLimiter = createProviderCoverSearchRateLimiter(providerRateLimits);
  const candidates = await searchCoverCandidates(
    {
      title,
      originalTitle,
      mediaType,
      releaseYear: normalizeReleaseYear(body.releaseYear),
      titleSource,
    },
    undefined,
    {
      candidateLimit: coverSettings.candidateLimit,
      tmdbResultScanLimit: coverSettings.tmdbResultScanLimit,
      providerCredentials,
      beforeProviderSearch: providerRateLimiter.canSearchProvider,
    },
    providerSettings,
  );

  if (providerRateLimiter.hasUnavailableLimitCheck() && candidates.length === 0) {
    return NextResponse.json(
      {
        candidates: [],
        error: "rate-limit-unavailable",
      },
      { status: 503 },
    );
  }

  return NextResponse.json({
    candidates: candidates.map((candidate) => ({
      ...candidate,
      token: createCoverCandidateToken(candidate),
    })),
  });
}
