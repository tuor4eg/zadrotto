import type { PublicationStatus } from "@/lib/media/publication-status";
import { generateEntityCode, slugifyCodePart } from "@/lib/common/generated-code";
import { COVER_IMAGE_TYPES, DEFAULT_COVER_MAX_BYTES } from "@/lib/covers/config";

export const AUTHOR_EDITABLE_PUBLICATION_STATUSES = [
  "private",
  "rejected",
] as const satisfies
  readonly PublicationStatus[];

export function isAuthorEditablePublicationStatus(status: PublicationStatus) {
  return AUTHOR_EDITABLE_PUBLICATION_STATUSES.some((editableStatus) => editableStatus === status);
}

export function normalizeOptionalFormString(value: string) {
  const normalized = value.trim();

  return normalized.length > 0 ? normalized : null;
}

export function getCoverFileExtension(contentType: string) {
  if (contentType === "image/jpeg") {
    return "jpg";
  }

  if (contentType === "image/png") {
    return "png";
  }

  if (contentType === "image/webp") {
    return "webp";
  }

  return null;
}

export function validateCoverFileInput(input: {
  size: number;
  type: string;
  maxBytes?: number;
}):
  | { ok: true }
  | { ok: false; error: "cover-too-large" | "cover-type" } {
  if (input.size <= 0) {
    return { ok: true as const };
  }

  if (input.size > (input.maxBytes ?? DEFAULT_COVER_MAX_BYTES)) {
    return { ok: false as const, error: "cover-too-large" };
  }

  if (!COVER_IMAGE_TYPES.some((contentType) => contentType === input.type)) {
    return { ok: false as const, error: "cover-type" };
  }

  return { ok: true as const };
}

export function buildAuthorCoverObjectKey(input: {
  authorId: number;
  mediaItemCode: string;
  contentType: string;
  uniqueId: string;
}) {
  const extension = getCoverFileExtension(input.contentType);

  if (!extension) {
    return null;
  }

  return `covers/authors/${input.authorId}/${input.mediaItemCode}-${input.uniqueId}.${extension}`;
}

export function buildAuthorMediaCode(input: {
  mediaType: string;
  title: string;
  uniqueId: string;
}) {
  return generateEntityCode({
    type: input.mediaType,
    name: input.title,
    uniqueId: input.uniqueId,
  });
}

export function parseOptionalReleaseYear(value: string) {
  const normalized = value.trim();

  if (!normalized) {
    return { ok: true as const, value: null };
  }

  if (!/^\d{1,4}$/.test(normalized)) {
    return { ok: false as const };
  }

  return { ok: true as const, value: Number(normalized) };
}

export function parseOptionalPositiveInteger(value: string) {
  const normalized = value.trim();

  if (!normalized) {
    return { ok: true as const, value: null };
  }

  if (!/^\d+$/.test(normalized)) {
    return { ok: false as const };
  }

  const parsedValue = Number(normalized);

  return Number.isSafeInteger(parsedValue) && parsedValue > 0
    ? { ok: true as const, value: parsedValue }
    : { ok: false as const };
}

export function slugifyMediaTitle(title: string) {
  return slugifyCodePart(title);
}
