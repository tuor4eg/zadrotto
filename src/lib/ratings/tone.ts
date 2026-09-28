export type RatingTone = "empty" | "bad" | "medium" | "good";

const RATING_TONE_CSS_VARIABLE_CLASS_NAMES: Record<RatingTone, string> = {
  empty: "[--rating-main:#D6D3D1] [--rating-border:rgba(245,245,244,0.9)] [--rating-author-border:rgba(214,211,209,0.50)] [--rating-glow:rgba(245,245,244,0.32)] [--rating-background:rgba(28,25,23,0.84)] [--rating-pill-background:rgba(28,25,23,0.50)]",
  bad: "[--rating-main:#FF454F] [--rating-border:rgba(255,69,79,0.95)] [--rating-author-border:rgba(255,69,79,0.50)] [--rating-glow:rgba(255,69,79,0.45)] [--rating-background:rgba(65,8,13,0.86)] [--rating-pill-background:rgba(65,8,13,0.50)]",
  medium: "[--rating-main:#FFC21C] [--rating-border:rgba(255,194,28,0.95)] [--rating-author-border:rgba(255,194,28,0.50)] [--rating-glow:rgba(255,194,28,0.42)] [--rating-background:rgba(61,43,5,0.86)] [--rating-pill-background:rgba(61,43,5,0.50)]",
  good: "[--rating-main:#34F5A5] [--rating-border:rgba(52,245,165,0.95)] [--rating-author-border:rgba(52,245,165,0.50)] [--rating-glow:rgba(52,245,165,0.42)] [--rating-background:rgba(5,48,37,0.86)] [--rating-pill-background:rgba(5,48,37,0.50)]",
};

export const EMPTY_RATING_TONE_CLASS_NAME =
  `${RATING_TONE_CSS_VARIABLE_CLASS_NAMES.empty} border-[color:var(--rating-border)] bg-[var(--rating-background)] text-[var(--rating-main)]`;

export const AVERAGE_RATING_TONE_CLASS_NAMES: Record<RatingTone, string> = {
  empty: EMPTY_RATING_TONE_CLASS_NAME,
  bad: `${RATING_TONE_CSS_VARIABLE_CLASS_NAMES.bad} border-[color:var(--rating-border)] bg-[var(--rating-background)] text-[var(--rating-main)]`,
  medium: `${RATING_TONE_CSS_VARIABLE_CLASS_NAMES.medium} border-[color:var(--rating-border)] bg-[var(--rating-background)] text-[var(--rating-main)]`,
  good: `${RATING_TONE_CSS_VARIABLE_CLASS_NAMES.good} border-[color:var(--rating-border)] bg-[var(--rating-background)] text-[var(--rating-main)]`,
};

export const RATING_PILL_TONE_CLASS_NAMES: Record<RatingTone, string> = {
  empty: `${RATING_TONE_CSS_VARIABLE_CLASS_NAMES.empty} bg-[var(--rating-pill-background)] text-[var(--rating-main)]`,
  bad: `${RATING_TONE_CSS_VARIABLE_CLASS_NAMES.bad} bg-[var(--rating-pill-background)] text-[var(--rating-main)]`,
  medium: `${RATING_TONE_CSS_VARIABLE_CLASS_NAMES.medium} bg-[var(--rating-pill-background)] text-[var(--rating-main)]`,
  good: `${RATING_TONE_CSS_VARIABLE_CLASS_NAMES.good} bg-[var(--rating-pill-background)] text-[var(--rating-main)]`,
};

export const AVERAGE_RATING_TEXT_TONE_CLASS_NAMES: Record<RatingTone, string> = {
  empty: `${RATING_TONE_CSS_VARIABLE_CLASS_NAMES.empty} text-[var(--rating-main)]`,
  bad: `${RATING_TONE_CSS_VARIABLE_CLASS_NAMES.bad} text-[var(--rating-main)]`,
  medium: `${RATING_TONE_CSS_VARIABLE_CLASS_NAMES.medium} text-[var(--rating-main)]`,
  good: `${RATING_TONE_CSS_VARIABLE_CLASS_NAMES.good} text-[var(--rating-main)]`,
};

export const RATING_TEXT_TONE_CLASS_NAMES = AVERAGE_RATING_TEXT_TONE_CLASS_NAMES;

export const LIGHT_SURFACE_RATING_TEXT_TONE_CLASS_NAMES: Record<RatingTone, string> = {
  empty: `${RATING_TONE_CSS_VARIABLE_CLASS_NAMES.empty} [--rating-on-light:#57534E] text-[var(--rating-on-light)]`,
  bad: `${RATING_TONE_CSS_VARIABLE_CLASS_NAMES.bad} [--rating-on-light:#C8212C] text-[var(--rating-on-light)]`,
  medium: `${RATING_TONE_CSS_VARIABLE_CLASS_NAMES.medium} [--rating-on-light:#8A5A00] text-[var(--rating-on-light)]`,
  good: `${RATING_TONE_CSS_VARIABLE_CLASS_NAMES.good} [--rating-on-light:#087A52] text-[var(--rating-on-light)]`,
};

export const AUTHOR_RATING_TONE_CLASS_NAMES: Record<RatingTone, string> = {
  empty: `${RATING_TONE_CSS_VARIABLE_CLASS_NAMES.empty} border-[color:var(--rating-author-border)] bg-[var(--rating-background)] text-[var(--rating-main)]`,
  bad: `${RATING_TONE_CSS_VARIABLE_CLASS_NAMES.bad} border-[color:var(--rating-author-border)] bg-[var(--rating-background)] text-[var(--rating-main)]`,
  medium: `${RATING_TONE_CSS_VARIABLE_CLASS_NAMES.medium} border-[color:var(--rating-author-border)] bg-[var(--rating-background)] text-[var(--rating-main)]`,
  good: `${RATING_TONE_CSS_VARIABLE_CLASS_NAMES.good} border-[color:var(--rating-author-border)] bg-[var(--rating-background)] text-[var(--rating-main)]`,
};

export const AVERAGE_ANIME_RATING_TONE_CLASS_NAMES = LIGHT_SURFACE_RATING_TEXT_TONE_CLASS_NAMES;
export const AUTHOR_ANIME_RATING_TONE_CLASS_NAMES = LIGHT_SURFACE_RATING_TEXT_TONE_CLASS_NAMES;

export const AVERAGE_TERMINAL_RATING_TONE_CLASS_NAMES: Record<RatingTone, string> = {
  empty: `${RATING_TONE_CSS_VARIABLE_CLASS_NAMES.empty} border-[color:var(--rating-border)] text-[var(--rating-main)] shadow-[0_0_18px_var(--rating-glow)]`,
  bad: `${RATING_TONE_CSS_VARIABLE_CLASS_NAMES.bad} border-[color:var(--rating-border)] text-[var(--rating-main)] shadow-[0_0_18px_var(--rating-glow)]`,
  medium: `${RATING_TONE_CSS_VARIABLE_CLASS_NAMES.medium} border-[color:var(--rating-border)] text-[var(--rating-main)] shadow-[0_0_18px_var(--rating-glow)]`,
  good: `${RATING_TONE_CSS_VARIABLE_CLASS_NAMES.good} border-[color:var(--rating-border)] text-[var(--rating-main)] shadow-[0_0_18px_var(--rating-glow)]`,
};

export const AUTHOR_TERMINAL_RATING_TONE_CLASS_NAMES = AVERAGE_TERMINAL_RATING_TONE_CLASS_NAMES;
export const AVERAGE_WIN9X_RATING_TONE_CLASS_NAMES = LIGHT_SURFACE_RATING_TEXT_TONE_CLASS_NAMES;
export const AUTHOR_WIN9X_RATING_TONE_CLASS_NAMES = LIGHT_SURFACE_RATING_TEXT_TONE_CLASS_NAMES;
export const AVERAGE_WINDVD_RATING_TONE_CLASS_NAMES = LIGHT_SURFACE_RATING_TEXT_TONE_CLASS_NAMES;
export const AUTHOR_WINDVD_RATING_TONE_CLASS_NAMES = LIGHT_SURFACE_RATING_TEXT_TONE_CLASS_NAMES;
export const AVERAGE_DVD_MENU_RATING_TONE_CLASS_NAMES = LIGHT_SURFACE_RATING_TEXT_TONE_CLASS_NAMES;
export const AUTHOR_DVD_MENU_RATING_TONE_CLASS_NAMES = LIGHT_SURFACE_RATING_TEXT_TONE_CLASS_NAMES;
export const AVERAGE_COMIC_CARD_RATING_TONE_CLASS_NAMES = LIGHT_SURFACE_RATING_TEXT_TONE_CLASS_NAMES;
export const AUTHOR_COMIC_CARD_RATING_TONE_CLASS_NAMES = LIGHT_SURFACE_RATING_TEXT_TONE_CLASS_NAMES;
export const AVERAGE_BOOK_NOTE_RATING_TONE_CLASS_NAMES = LIGHT_SURFACE_RATING_TEXT_TONE_CLASS_NAMES;
export const AUTHOR_BOOK_NOTE_RATING_TONE_CLASS_NAMES = LIGHT_SURFACE_RATING_TEXT_TONE_CLASS_NAMES;
export const AVERAGE_MODERN_TV_RATING_TONE_CLASS_NAMES = LIGHT_SURFACE_RATING_TEXT_TONE_CLASS_NAMES;
export const AUTHOR_MODERN_TV_RATING_TONE_CLASS_NAMES = LIGHT_SURFACE_RATING_TEXT_TONE_CLASS_NAMES;
export const AVERAGE_PS1_RATING_TONE_CLASS_NAMES = RATING_TEXT_TONE_CLASS_NAMES;
export const AUTHOR_PS1_RATING_TONE_CLASS_NAMES = RATING_TEXT_TONE_CLASS_NAMES;
export const AVERAGE_ROBLOX_RATING_TONE_CLASS_NAMES = LIGHT_SURFACE_RATING_TEXT_TONE_CLASS_NAMES;
export const AUTHOR_ROBLOX_RATING_TONE_CLASS_NAMES = RATING_TEXT_TONE_CLASS_NAMES;

export const AVERAGE_STREAMING_RATING_TONE_CLASS_NAMES: Record<RatingTone, string> = {
  empty: `${RATING_TONE_CSS_VARIABLE_CLASS_NAMES.empty} text-[var(--rating-main)] [--streaming-rating-glow:var(--rating-glow)]`,
  bad: `${RATING_TONE_CSS_VARIABLE_CLASS_NAMES.bad} text-[var(--rating-main)] [--streaming-rating-glow:var(--rating-glow)]`,
  medium: `${RATING_TONE_CSS_VARIABLE_CLASS_NAMES.medium} text-[var(--rating-main)] [--streaming-rating-glow:var(--rating-glow)]`,
  good: `${RATING_TONE_CSS_VARIABLE_CLASS_NAMES.good} text-[var(--rating-main)] [--streaming-rating-glow:var(--rating-glow)]`,
};

export const AUTHOR_STREAMING_RATING_TONE_CLASS_NAMES = AVERAGE_STREAMING_RATING_TONE_CLASS_NAMES;

export const RATING_BUTTON_TONE_CLASS_NAMES: Record<RatingTone, string> = {
  empty: EMPTY_RATING_TONE_CLASS_NAME,
  bad: `${RATING_TONE_CSS_VARIABLE_CLASS_NAMES.bad} border-[color:var(--rating-border)] bg-[var(--rating-background)] text-[var(--rating-main)] hover:brightness-110`,
  medium: `${RATING_TONE_CSS_VARIABLE_CLASS_NAMES.medium} border-[color:var(--rating-border)] bg-[var(--rating-background)] text-[var(--rating-main)] hover:brightness-110`,
  good: `${RATING_TONE_CSS_VARIABLE_CLASS_NAMES.good} border-[color:var(--rating-border)] bg-[var(--rating-background)] text-[var(--rating-main)] hover:brightness-110`,
};

export const RATING_BAR_TONE_CLASS_NAMES: Record<RatingTone, string> = {
  empty: `${RATING_TONE_CSS_VARIABLE_CLASS_NAMES.empty} bg-[var(--rating-main)]`,
  bad: `${RATING_TONE_CSS_VARIABLE_CLASS_NAMES.bad} bg-[var(--rating-main)]`,
  medium: `${RATING_TONE_CSS_VARIABLE_CLASS_NAMES.medium} bg-[var(--rating-main)]`,
  good: `${RATING_TONE_CSS_VARIABLE_CLASS_NAMES.good} bg-[var(--rating-main)]`,
};

export function getRatingTone(score: number | null): RatingTone {
  if (score === null) {
    return "empty";
  }

  if (score < 50) {
    return "bad";
  }

  if (score >= 80) {
    return "good";
  }

  return "medium";
}
