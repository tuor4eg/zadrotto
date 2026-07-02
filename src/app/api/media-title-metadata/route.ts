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
import { getTitleMetadata } from "@/lib/covers/registry";
import { isCoverProviderCode } from "@/lib/covers/types";
import { createMediaMetadataCandidateToken } from "@/lib/media/metadata-candidates";
import { isMediaTypeCode } from "@/lib/media/types";

type MediaTitleMetadataRequestBody = {
  externalId?: unknown;
  mediaType?: unknown;
  provider?: unknown;
};

function normalizeOptionalString(value: unknown) {
  return typeof value === "string" && value.trim() ? value.trim() : null;
}

export async function POST(request: Request) {
  const [adminUser, author] = await Promise.all([getCurrentAdminUser(), getCurrentAuthor()]);

  if (!adminUser && !author) {
    return NextResponse.json({ metadata: null }, { status: 401 });
  }

  const body = (await request.json().catch(() => ({}))) as MediaTitleMetadataRequestBody;
  const provider = normalizeOptionalString(body.provider);
  const externalId = normalizeOptionalString(body.externalId);
  const mediaType = normalizeOptionalString(body.mediaType);

  if (
    !provider ||
    !externalId ||
    !mediaType ||
    !isCoverProviderCode(provider) ||
    !isMediaTypeCode(mediaType)
  ) {
    return NextResponse.json({ metadata: null });
  }

  if (author && !adminUser) {
    const rateLimit = await checkAuthorCoverSearchRateLimit(author);

    if (!rateLimit.ok) {
      return NextResponse.json(
        {
          error: rateLimit.error,
          metadata: null,
          retryAfterSeconds: rateLimit.retryAfterSeconds,
        },
        { status: rateLimit.status },
      );
    }
  }

  const [coverSettings, providerSettings, providerRateLimits, providerCredentials] =
    await Promise.all([
      getCoverSettings(),
      getCoverProviderSettings(),
      getCoverProviderRateLimits(),
      getCoverProviderCredentialsForSearch(),
    ]);
  const providerRateLimiter = createProviderCoverSearchRateLimiter(providerRateLimits);
  const metadata = await getTitleMetadata(
    {
      provider,
      externalId,
      mediaType,
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

  if (providerRateLimiter.hasUnavailableLimitCheck() && !metadata) {
    return NextResponse.json(
      {
        error: "rate-limit-unavailable",
        metadata: null,
      },
      { status: 503 },
    );
  }

  return NextResponse.json({
    metadata: metadata
      ? {
          facts: metadata.facts,
          sourceProvider: metadata.provider,
          sourceExternalId: metadata.externalId,
          sourceUrl: metadata.sourceUrl,
          metadataCandidateToken: createMediaMetadataCandidateToken(metadata),
        }
      : null,
  });
}
