import { NextResponse } from "next/server";

import { getCurrentAdminUser } from "@/lib/auth/admin-auth";
import { getCurrentAuthor } from "@/lib/auth/author-auth";
import { getAccessibleMediaTypeCodes } from "@/db/queries/media-types";
import {
  suggestFranchisesForMediaItem,
  type SuggestFranchisesMediaInput,
} from "@/lib/ai/scenarios/suggest-franchises";
import { AiError } from "@/lib/ai/types";
import { checkAuthorAiScenarioRateLimit } from "@/lib/ai/rate-limits";
import { isMediaTypeCode } from "@/lib/media/types";

function optionalString(value: unknown, maxLength: number) {
  if (typeof value !== "string") return null;
  const normalized = value.trim();
  return normalized && normalized.length <= maxLength ? normalized : null;
}

function positiveIds(value: unknown) {
  return Array.isArray(value)
    ? [...new Set(value.map(Number).filter((id) => Number.isSafeInteger(id) && id > 0))]
    : [];
}

function parseInput(value: unknown): SuggestFranchisesMediaInput | null {
  if (!value || typeof value !== "object" || Array.isArray(value)) return null;
  const source = value as Record<string, unknown>;
  const title = optionalString(source.title, 300);
  const mediaType = optionalString(source.mediaType, 100);
  if (!title || !mediaType || !isMediaTypeCode(mediaType)) return null;
  const releaseYear = source.releaseYear === null || source.releaseYear === "" ||
    source.releaseYear === undefined
    ? null
    : Number(source.releaseYear);
  if (releaseYear !== null &&
      (!Number.isInteger(releaseYear) || releaseYear < 0 || releaseYear > 9999)) {
    return null;
  }

  return {
    title,
    originalTitle: optionalString(source.originalTitle, 300),
    aliases: Array.isArray(source.aliases)
      ? source.aliases.slice(0, 20)
        .filter((item): item is string =>
          typeof item === "string" && Boolean(item.trim()) && item.trim().length <= 300)
        .map((item) => item.trim())
      : [],
    mediaType,
    mediaTypeLabel: optionalString(source.mediaTypeLabel, 200),
    releaseYear,
    description: optionalString(source.description, 10_000),
    mediaCarrier: optionalString(source.mediaCarrier, 200),
    metadata: source.metadata && typeof source.metadata === "object" &&
      !Array.isArray(source.metadata) && JSON.stringify(source.metadata).length <= 20_000
      ? source.metadata as Record<string, unknown>
      : {},
    selectedFranchiseIds: positiveIds(source.selectedFranchiseIds),
  };
}

export async function POST(request: Request) {
  const [admin, author] = await Promise.all([getCurrentAdminUser(), getCurrentAuthor()]);
  if (!admin && !author) {
    return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  }
  const input = parseInput(await request.json().catch(() => null));
  if (!input) {
    return NextResponse.json(
      { error: "invalid-input", message: "Заполни название и тип записи." },
      { status: 422 },
    );
  }
  if (!admin && author &&
      !(await getAccessibleMediaTypeCodes(author.id)).includes(input.mediaType)) {
    return NextResponse.json({ error: "forbidden" }, { status: 403 });
  }
  if (!admin && author) {
    const rateLimit = await checkAuthorAiScenarioRateLimit(author.id);
    if (!rateLimit.ok) {
      return NextResponse.json({
        error: rateLimit.error,
        message: rateLimit.status === 429
          ? "Слишком много AI-запросов. Попробуй позже."
          : "Проверка лимита AI-запросов временно недоступна.",
        retryAfterSeconds: rateLimit.retryAfterSeconds,
      }, { status: rateLimit.status });
    }
  }

  try {
    return NextResponse.json(await suggestFranchisesForMediaItem(input, {
      currentAuthorId: admin ? undefined : author?.id,
    }));
  } catch (error) {
    if (error instanceof AiError) {
      return NextResponse.json({ error: error.code, message: error.message }, { status: 409 });
    }
    console.error("Failed to suggest franchises", error);
    return NextResponse.json(
      { error: "unexpected", message: "Не удалось подобрать серии." },
      { status: 500 },
    );
  }
}
