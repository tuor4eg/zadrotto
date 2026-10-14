export const TITLE_PART_TYPES = ["season", "issue", "volume", "part"] as const;
export type TitlePartType = typeof TITLE_PART_TYPES[number];

const LABELS: Record<TitlePartType, { singular: string; plural: string }> = {
  season: { singular: "Сезон", plural: "Сезоны" },
  issue: { singular: "Выпуск", plural: "Выпуски" },
  volume: { singular: "Том", plural: "Тома" },
  part: { singular: "Часть", plural: "Части" },
};

export function getTitlePartLabel(part: { type: TitlePartType; number: number; name?: string | null }) {
  if (part.type === "season" && part.number === 0) return "Спецвыпуски";
  return part.name?.trim() || `${LABELS[part.type].singular} ${part.number}`;
}

export function getTitlePartsHeading(parts: readonly { type: TitlePartType }[]) {
  const types = new Set(parts.map((part) => part.type));
  return types.size === 1 ? LABELS[parts[0].type].plural : "Части";
}

export function getEffectiveRating(overall: number | null, parts: readonly number[]): number | null {
  return overall ?? (parts.length ? parts.reduce((sum, score) => sum + score, 0) / parts.length : null);
}

export type TitlePartProviderInput = {
  /** Undefined preserves the saved description when a provider has no translation. */
  description?: string;
  type: TitlePartType;
  number: number;
  name: string | null;
  year: number | null;
  externalId: string;
  airDate: string | null;
  episodeCount: number | null;
  posterSourceUrl: string | null;
  sortOrder: number;
};

export function isTitlePartRateable(part: { type: TitlePartType; number: number }) {
  return part.type !== "season" || part.number !== 0;
}

export function isTitlePartReviewable(part: { type: TitlePartType; number: number }) {
  return part.type !== "season" || part.number !== 0;
}
