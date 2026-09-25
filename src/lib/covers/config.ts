export const DEFAULT_COVER_CANDIDATE_LIMIT = 8;
export const DEFAULT_TMDB_COVER_RESULT_SCAN_LIMIT = 3;
export const COVER_IMAGE_TYPES = ["image/jpeg", "image/png", "image/webp"] as const;
export const DEFAULT_COVER_MAX_BYTES = 5 * 1024 * 1024;
export const DEFAULT_PROVIDER_REQUEST_TIMEOUT_MS = 15_000;
export const MIN_PROVIDER_REQUEST_TIMEOUT_MS = 1_000;
export const MAX_PROVIDER_REQUEST_TIMEOUT_MS = 120_000;

export function resolveProviderRequestTimeoutMs(value: unknown): number {
  if (typeof value !== "number" || !Number.isFinite(value)) {
    return DEFAULT_PROVIDER_REQUEST_TIMEOUT_MS;
  }

  const rounded = Math.round(value);

  if (
    !Number.isSafeInteger(rounded) ||
    rounded < MIN_PROVIDER_REQUEST_TIMEOUT_MS ||
    rounded > MAX_PROVIDER_REQUEST_TIMEOUT_MS
  ) {
    return DEFAULT_PROVIDER_REQUEST_TIMEOUT_MS;
  }

  return rounded;
}
