export const RATING_SCORE_VALUES = Array.from({ length: 10 }, (_, index) => 100 - index * 10);

export function formatScore(score: number | null) {
  if (score === null) {
    return "\u2014";
  }

  const normalizedScore = score / 10;

  return Number.isInteger(normalizedScore)
    ? String(normalizedScore)
    : normalizedScore.toFixed(1);
}

export function formatRatingsCount(count: number) {
  const lastTwoDigits = count % 100;

  if (lastTwoDigits >= 11 && lastTwoDigits <= 14) {
    return `${count} оценок`;
  }

  const lastDigit = count % 10;

  if (lastDigit === 1) {
    return `${count} оценка`;
  }

  if (lastDigit >= 2 && lastDigit <= 4) {
    return `${count} оценки`;
  }

  return `${count} оценок`;
}

export function parseRatingScoreInput(value: FormDataEntryValue | null) {
  if (typeof value !== "string" || !value.trim()) {
    return null;
  }

  const normalizedValue = value.trim().replace(",", ".");
  const numericValue = Number(normalizedValue);
  const score = Math.round(numericValue * 10);

  if (
    !Number.isFinite(numericValue) ||
    !Number.isInteger(score) ||
    score < 10 ||
    score > 100 ||
    score % 10 !== 0
  ) {
    return null;
  }

  return score;
}
