import { NextResponse } from "next/server";

import {
  getCoverProviderCredentialsForSearch,
  getCoverProviderSettings,
  getCoverSettings,
} from "@/db/queries/cover-settings";
import { getCurrentAdminUser } from "@/lib/admin-auth";
import { getCurrentAuthor } from "@/lib/author-auth";
import { createCoverCandidateToken } from "@/lib/covers/candidates";
import { searchCoverCandidates } from "@/lib/covers/registry";
import { isMediaTypeCode } from "@/lib/media-types";

type CoverCandidatesRequestBody = {
  title?: unknown;
  originalTitle?: unknown;
  mediaType?: unknown;
  releaseYear?: unknown;
};

function normalizeOptionalString(value: unknown) {
  return typeof value === "string" && value.trim() ? value.trim() : null;
}

function normalizeReleaseYear(value: unknown) {
  if (value === null || value === undefined || value === "") {
    return null;
  }

  const numberValue = typeof value === "number" ? value : Number(value);

  return Number.isInteger(numberValue) && numberValue >= 0 && numberValue <= 9999
    ? numberValue
    : null;
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

  if (!mediaType || !isMediaTypeCode(mediaType) || (!title && !originalTitle)) {
    return NextResponse.json({ candidates: [] });
  }

  const [coverSettings, providerSettings, providerCredentials] = await Promise.all([
    getCoverSettings(),
    getCoverProviderSettings(),
    getCoverProviderCredentialsForSearch(),
  ]);
  const candidates = await searchCoverCandidates(
    {
      title,
      originalTitle,
      mediaType,
      releaseYear: normalizeReleaseYear(body.releaseYear),
    },
    undefined,
    {
      candidateLimit: coverSettings.candidateLimit,
      tmdbResultScanLimit: coverSettings.tmdbResultScanLimit,
      providerCredentials,
    },
    providerSettings,
  );

  return NextResponse.json({
    candidates: candidates.map((candidate) => ({
      ...candidate,
      token: createCoverCandidateToken(candidate),
    })),
  });
}
