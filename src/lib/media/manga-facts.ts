/** MangaUpdates exposes volume counts only in its free-form publication status. */
export function parseMangaVolumeCount(status: unknown): number | null {
  if (typeof status !== "string") return null;
  const match = status.match(/(?:^|[^\w.,+\-])(\d+)\+?\s+volumes?\b|\bvolumes?\s+(\d+)\+?(?=$|[\s(),;])/i);
  const count = match ? Number(match[1] ?? match[2]) : null;
  return count !== null && Number.isSafeInteger(count) && count > 0 ? count : null;
}
