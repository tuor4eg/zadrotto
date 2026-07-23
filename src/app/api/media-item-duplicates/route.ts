import { NextResponse } from "next/server";

import { findPublishedMediaItemDuplicateCandidates } from "@/db/queries/media-items";
import { getArchiveSettings } from "@/db/queries/archive-settings";
import { getCurrentAdminUser } from "@/lib/auth/admin-auth";
import { getCurrentAuthor } from "@/lib/auth/author-auth";
import {
  createMediaItemDuplicateAcknowledgementToken,
  isExactMediaItemDuplicate,
} from "@/lib/media/media-item-duplicates";
import { normalizeMediaItemTitleAliases } from "@/lib/media/title-aliases";
import { isMediaTypeCode } from "@/lib/media/types";

type MediaItemDuplicatesRequestBody = {
  aliases?: unknown;
  mediaItemId?: unknown;
  mediaType?: unknown;
  originalTitle?: unknown;
  releaseYear?: unknown;
  title?: unknown;
};

function normalizeRequiredString(value: unknown) {
  return typeof value === "string" && value.trim() ? value.trim() : null;
}

function normalizeOptionalString(value: unknown) {
  return typeof value === "string" && value.trim() ? value.trim() : null;
}

function normalizeOptionalReleaseYear(value: unknown) {
  if (value === null || value === undefined || value === "") {
    return null;
  }

  const releaseYear = typeof value === "number" ? value : Number(value);

  return Number.isInteger(releaseYear) && releaseYear >= 0 && releaseYear <= 9999
    ? releaseYear
    : null;
}

export async function POST(request: Request) {
  const [adminUser, author] = await Promise.all([getCurrentAdminUser(), getCurrentAuthor()]);

  if (!adminUser && !author) {
    return NextResponse.json({ matches: [] }, { status: 401 });
  }

  const body = (await request.json().catch(() => ({}))) as MediaItemDuplicatesRequestBody;
  const title = normalizeRequiredString(body.title);
  const mediaType = normalizeRequiredString(body.mediaType);
  const originalTitle = normalizeOptionalString(body.originalTitle);

  if (!title || !mediaType || !isMediaTypeCode(mediaType)) {
    return NextResponse.json({ matches: [], acknowledgementToken: "" });
  }

  const aliases = normalizeMediaItemTitleAliases(
    Array.isArray(body.aliases)
      ? body.aliases.filter((value): value is string => typeof value === "string")
      : [],
    { title, originalTitle },
  );
  const { maxTitleAliases } = await getArchiveSettings();

  if (aliases.length > maxTitleAliases) {
    return NextResponse.json(
      { error: "too-many-aliases", maxTitleAliases },
      { status: 422 },
    );
  }

  const input = {
    aliases,
    excludeMediaItemId:
      Number.isInteger(Number(body.mediaItemId)) && Number(body.mediaItemId) > 0
        ? Number(body.mediaItemId)
        : undefined,
    title,
    originalTitle,
    mediaType,
    releaseYear: normalizeOptionalReleaseYear(body.releaseYear),
  };
  const matches = await findPublishedMediaItemDuplicateCandidates(input);
  const exactMatches = matches.filter((match) => isExactMediaItemDuplicate(input, match));
  const possibleMatches = matches.filter((match) => !exactMatches.includes(match));
  const acknowledgementToken =
    possibleMatches.length > 0
      ? createMediaItemDuplicateAcknowledgementToken({
          form: input,
          matches: possibleMatches,
        })
      : "";

  return NextResponse.json({
    matches,
    exactMatchIds: exactMatches.map((match) => match.id),
    acknowledgementToken,
  });
}
