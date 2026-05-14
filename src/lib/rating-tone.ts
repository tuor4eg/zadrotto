export type RatingTone = "bad" | "medium" | "good";

export const AVERAGE_RATING_TONE_CLASS_NAMES: Record<RatingTone, string> = {
  bad: "border-red-950/25 bg-red-50/90 text-red-950",
  medium: "border-stone-950/25 bg-stone-50/90 text-stone-950",
  good: "border-emerald-950/25 bg-emerald-50/90 text-emerald-950",
};

export const AUTHOR_RATING_TONE_CLASS_NAMES: Record<RatingTone, string> = {
  bad: "border-red-950/25 bg-red-700 text-red-50",
  medium: "border-stone-950/25 bg-stone-700 text-stone-50",
  good: "border-emerald-950/25 bg-emerald-700 text-emerald-50",
};

export const RATING_BUTTON_TONE_CLASS_NAMES: Record<RatingTone, string> = {
  bad: "border-red-950/20 bg-red-50/80 text-red-950 hover:border-red-700",
  medium: "border-stone-300/80 bg-stone-50/80 text-stone-700 hover:border-stone-950",
  good: "border-emerald-950/20 bg-emerald-50/80 text-emerald-950 hover:border-emerald-700",
};

export const SELECTED_RATING_BUTTON_TONE_CLASS_NAMES: Record<RatingTone, string> = {
  bad: "border-red-700 bg-red-700 text-red-50",
  medium: "border-stone-950 bg-stone-950 text-stone-50",
  good: "border-emerald-700 bg-emerald-700 text-emerald-50",
};

export function getRatingTone(score: number | null): RatingTone {
  if (score !== null && score <= 30) {
    return "bad";
  }

  if (score !== null && score >= 70) {
    return "good";
  }

  return "medium";
}
