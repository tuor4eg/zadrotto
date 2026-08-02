export const DEFAULT_DAILY_DOSSIER_MIN_AVERAGE_SCORE = 6;
export const MIN_DAILY_DOSSIER_MIN_AVERAGE_SCORE = 0;
export const MAX_DAILY_DOSSIER_MIN_AVERAGE_SCORE = 10;

export function parseDailyDossierMinAverageScore(value: unknown) {
  if (typeof value !== "number" && typeof value !== "string") {
    return null;
  }

  if (typeof value === "string" && value.trim() === "") {
    return null;
  }

  const score = typeof value === "number" ? value : Number(value);

  return Number.isInteger(score)
    && score >= MIN_DAILY_DOSSIER_MIN_AVERAGE_SCORE
    && score <= MAX_DAILY_DOSSIER_MIN_AVERAGE_SCORE
    ? score
    : null;
}
