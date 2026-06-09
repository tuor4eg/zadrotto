import type { MediaType } from "@/lib/media/types";
import { isMediaTypeCode } from "@/lib/media/types";
import { slugifyCodePart } from "@/lib/common/generated-code";

export type MediaCarrierFormInput = {
  code: string;
  description: string | null;
  mediaTypes: MediaType[];
  name: string;
};

export function normalizeOptionalMediaCarrierString(value: string) {
  const normalized = value.trim();

  return normalized.length > 0 ? normalized : null;
}

export function normalizeMediaCarrierCode(value: string) {
  const trimmedValue = value.trim();

  return trimmedValue.length > 0 ? slugifyCodePart(trimmedValue) : "";
}

export function parseMediaCarrierFormMediaTypes(values: FormDataEntryValue[]) {
  const mediaTypes: MediaType[] = [];
  const seenMediaTypes = new Set<MediaType>();

  for (const value of values) {
    if (typeof value !== "string") {
      return null;
    }

    const normalized = value.trim();

    if (!isMediaTypeCode(normalized)) {
      return null;
    }

    if (!seenMediaTypes.has(normalized)) {
      seenMediaTypes.add(normalized);
      mediaTypes.push(normalized);
    }
  }

  return mediaTypes.length > 0 ? mediaTypes : null;
}

export function parseRequiredMediaCarrierId(value: string) {
  const normalized = value.trim();

  if (!/^\d+$/.test(normalized)) {
    return { ok: false as const };
  }

  const parsedValue = Number(normalized);

  return Number.isSafeInteger(parsedValue) && parsedValue > 0
    ? { ok: true as const, value: parsedValue }
    : { ok: false as const };
}

export function validateMediaCarrierForMediaType(input: {
  mediaCarrierId: number | null;
  mediaCarrierMediaTypes: MediaType[] | null;
  mediaType: MediaType;
}) {
  if (input.mediaCarrierId === null) {
    return { ok: true as const };
  }

  if (input.mediaCarrierMediaTypes === null) {
    return { ok: false as const, error: "invalid-carrier" };
  }

  if (!input.mediaCarrierMediaTypes.includes(input.mediaType)) {
    return { ok: false as const, error: "carrier-media-type" };
  }

  return { ok: true as const };
}
