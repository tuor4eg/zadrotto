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

export const AVERAGE_TERMINAL_RATING_TONE_CLASS_NAMES: Record<RatingTone, string> = {
  bad: "border-red-400/60 text-red-300 shadow-[0_0_18px_rgba(252,165,165,0.12)]",
  medium: "border-stone-300/60 text-stone-200 shadow-[0_0_18px_rgba(214,211,209,0.12)]",
  good: "border-emerald-400/60 text-emerald-300 shadow-[0_0_18px_rgba(110,231,183,0.12)]",
};

export const AUTHOR_TERMINAL_RATING_TONE_CLASS_NAMES: Record<RatingTone, string> = {
  bad: "border-red-700/75 text-red-500 shadow-[0_0_18px_rgba(185,28,28,0.16)]",
  medium: "border-stone-700/75 text-stone-400 shadow-[0_0_18px_rgba(68,64,60,0.18)]",
  good: "border-emerald-700/75 text-emerald-500 shadow-[0_0_18px_rgba(4,120,87,0.16)]",
};

export const AVERAGE_WIN9X_RATING_TONE_CLASS_NAMES: Record<RatingTone, string> = {
  bad: "text-red-900/80",
  medium: "text-stone-800",
  good: "text-emerald-900/80",
};

export const AUTHOR_WIN9X_RATING_TONE_CLASS_NAMES: Record<RatingTone, string> = {
  bad: "text-red-700",
  medium: "text-stone-950",
  good: "text-emerald-700",
};

export const AVERAGE_WINDVD_RATING_TONE_CLASS_NAMES: Record<RatingTone, string> = {
  bad: "text-red-800",
  medium: "text-sky-800",
  good: "text-emerald-800",
};

export const AUTHOR_WINDVD_RATING_TONE_CLASS_NAMES: Record<RatingTone, string> = {
  bad: "text-red-700",
  medium: "text-sky-700",
  good: "text-emerald-700",
};

export const AVERAGE_DVD_MENU_RATING_TONE_CLASS_NAMES: Record<RatingTone, string> = {
  bad: "text-red-800",
  medium: "text-stone-700",
  good: "text-emerald-800",
};

export const AUTHOR_DVD_MENU_RATING_TONE_CLASS_NAMES: Record<RatingTone, string> = {
  bad: "text-red-700",
  medium: "text-stone-700",
  good: "text-emerald-700",
};

export const AVERAGE_COMIC_CARD_RATING_TONE_CLASS_NAMES: Record<RatingTone, string> = {
  bad: "text-red-800",
  medium: "text-stone-950",
  good: "text-emerald-800",
};

export const AUTHOR_COMIC_CARD_RATING_TONE_CLASS_NAMES: Record<RatingTone, string> = {
  bad: "text-red-700",
  medium: "text-stone-950",
  good: "text-emerald-700",
};

export const AVERAGE_MODERN_TV_RATING_TONE_CLASS_NAMES: Record<RatingTone, string> = {
  bad: "text-red-800",
  medium: "text-blue-900",
  good: "text-blue-900",
};

export const AUTHOR_MODERN_TV_RATING_TONE_CLASS_NAMES: Record<RatingTone, string> = {
  bad: "text-red-800",
  medium: "text-red-800",
  good: "text-red-800",
};

export const AVERAGE_PS1_RATING_TONE_CLASS_NAMES: Record<RatingTone, string> = {
  bad: "text-red-800",
  medium: "text-stone-300",
  good: "text-emerald-800",
};

export const AUTHOR_PS1_RATING_TONE_CLASS_NAMES: Record<RatingTone, string> = {
  bad: "text-red-700",
  medium: "text-stone-300",
  good: "text-emerald-700",
};

export const AVERAGE_STREAMING_RATING_TONE_CLASS_NAMES: Record<RatingTone, string> = {
  bad: "text-red-400 [--streaming-rating-glow:rgba(248,113,113,0.18)]",
  medium: "text-stone-300 [--streaming-rating-glow:rgba(214,211,209,0.14)]",
  good: "text-emerald-400 [--streaming-rating-glow:rgba(52,211,153,0.18)]",
};

export const AUTHOR_STREAMING_RATING_TONE_CLASS_NAMES: Record<RatingTone, string> = {
  bad: "text-red-400 [--streaming-rating-glow:rgba(248,113,113,0.18)]",
  medium: "text-stone-300 [--streaming-rating-glow:rgba(214,211,209,0.14)]",
  good: "text-emerald-400 [--streaming-rating-glow:rgba(52,211,153,0.18)]",
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

export const RATING_BAR_TONE_CLASS_NAMES: Record<RatingTone, string> = {
  bad: "bg-red-700/75",
  medium: "bg-stone-700/75",
  good: "bg-emerald-700/75",
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
