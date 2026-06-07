import type { MediaType } from "@/lib/media/types";

export type MediaCarrierFormInput = {
  description: string | null;
  mediaType: MediaType;
  name: string;
};

export function normalizeOptionalMediaCarrierString(value: string) {
  const normalized = value.trim();

  return normalized.length > 0 ? normalized : null;
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
  mediaCarrierMediaType: MediaType | null;
  mediaType: MediaType;
}) {
  if (input.mediaCarrierId === null) {
    return { ok: true as const };
  }

  if (input.mediaCarrierMediaType === null) {
    return { ok: false as const, error: "invalid-carrier" };
  }

  if (input.mediaCarrierMediaType !== input.mediaType) {
    return { ok: false as const, error: "carrier-media-type" };
  }

  return { ok: true as const };
}
