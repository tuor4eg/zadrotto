export const DEFAULT_RECENTLY_VIEWED_HISTORY_LIMIT = 50;
export const DEFAULT_RECENTLY_VIEWED_TTL_DAYS = 90;

function parseIntegerInRange(value: unknown, min: number, max: number) {
  if (typeof value !== "number" && typeof value !== "string") return null;
  if (typeof value === "string" && value.trim() === "") return null;
  const parsed = typeof value === "number" ? value : Number(value);
  return Number.isInteger(parsed) && parsed >= min && parsed <= max ? parsed : null;
}

export function parseRecentlyViewedHistoryLimit(value: unknown) {
  return parseIntegerInRange(value, 1, 500);
}

export function parseRecentlyViewedTtlDays(value: unknown) {
  return parseIntegerInRange(value, 1, 365);
}
