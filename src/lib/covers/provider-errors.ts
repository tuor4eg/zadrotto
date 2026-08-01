export type ProviderRequestError =
  | "provider-unavailable"
  | "provider-daily-limit"
  | "rate-limit-unavailable";

export type CoverRequestError = ProviderRequestError | "author-rate-limit";

export const COVER_REQUEST_ERROR_MESSAGES: Record<CoverRequestError, string> = {
  "author-rate-limit": "Ваш лимит поиска исчерпан. Попробуйте позже.",
  "provider-daily-limit": "Суточный лимит провайдера исчерпан. Попробуйте позже.",
  "provider-unavailable": "Внешний провайдер временно недоступен. Попробуйте позже.",
  "rate-limit-unavailable": "Не удалось проверить лимиты поиска. Попробуйте позже.",
};

export function isCoverRequestError(value: unknown): value is CoverRequestError {
  return typeof value === "string" && value in COVER_REQUEST_ERROR_MESSAGES;
}

export function getAggregatedProviderRequestError(
  errors: readonly ProviderRequestError[],
): ProviderRequestError | null {
  if (errors.includes("rate-limit-unavailable")) return "rate-limit-unavailable";
  if (errors.includes("provider-daily-limit")) return "provider-daily-limit";
  if (errors.includes("provider-unavailable")) return "provider-unavailable";
  return null;
}
