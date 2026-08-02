export const DEFAULT_TOP_ARCHIVE_MIN_AVERAGE_SCORE = 0;
export const DEFAULT_TOP_ARCHIVE_MIN_RATINGS_COUNT = 1;

function parseInteger(value: unknown, min: number, max: number) {
  if (typeof value !== "number" && typeof value !== "string") return null;
  if (typeof value === "string" && value.trim() === "") return null;
  const parsed = typeof value === "number" ? value : Number(value);
  return Number.isInteger(parsed) && parsed >= min && parsed <= max ? parsed : null;
}

export function parseTopArchiveMinAverageScore(value: unknown) {
  return parseInteger(value, 0, 10);
}

export function parseTopArchiveMinRatingsCount(value: unknown) {
  return parseInteger(value, 0, 1000);
}

export function getRotatedMediaTypeCodes(codes: readonly string[], date: Date) {
  const sortedCodes = [...new Set(codes)].sort((left, right) => left.localeCompare(right, "en"));
  if (sortedCodes.length < 2) return sortedCodes;
  const utcDay = Math.floor(Date.UTC(
    date.getUTCFullYear(),
    date.getUTCMonth(),
    date.getUTCDate(),
  ) / 86_400_000);
  const offset = utcDay % sortedCodes.length;
  return [...sortedCodes.slice(offset), ...sortedCodes.slice(0, offset)];
}

export function roundRobinMediaTypeItems<T>(
  groups: readonly (readonly T[])[],
  limit: number,
) {
  const result: T[] = [];

  for (let index = 0; result.length < limit; index += 1) {
    let added = false;
    for (const group of groups) {
      const item = group[index];
      if (item !== undefined) {
        result.push(item);
        added = true;
        if (result.length === limit) break;
      }
    }
    if (!added) break;
  }

  return result;
}
