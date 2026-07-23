import { NextResponse } from "next/server";

import {
  getCoverProviderCredentialsForSearch,
  getCoverProviderRateLimits,
  getCoverProviderSettings,
  getCoverSettings,
} from "@/db/queries/cover-settings";
import { getCurrentAdminUser } from "@/lib/auth/admin-auth";
import { getCurrentAuthor } from "@/lib/auth/author-auth";
import {
  checkAuthorCoverSearchRateLimit,
  createProviderCoverSearchRateLimiter,
} from "@/lib/covers/rate-limits";
import { searchTitleCandidates } from "@/lib/covers/registry";
import { createMediaTitleSourceToken } from "@/lib/media/metadata-candidates";
import { isMediaTypeCode } from "@/lib/media/types";

type MediaTitleCandidatesRequestBody = {
  mediaType?: unknown;
  query?: unknown;
};

function normalizeOptionalString(value: unknown) {
  return typeof value === "string" && value.trim() ? value.trim() : null;
}

export async function POST(request: Request) {
  const [adminUser, author] = await Promise.all([getCurrentAdminUser(), getCurrentAuthor()]);

  if (!adminUser && !author) {
    return NextResponse.json({ candidates: [] }, { status: 401 });
  }

  const body = (await request.json().catch(() => ({}))) as MediaTitleCandidatesRequestBody;
  const query = normalizeOptionalString(body.query);
  const mediaType = normalizeOptionalString(body.mediaType);

  if (!query || !mediaType || !isMediaTypeCode(mediaType)) {
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
  const candidates = await searchTitleCandidates(
    {
      mediaType,
      query,
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
      titleSourceToken: createMediaTitleSourceToken(candidate),
    })),
  });
}
