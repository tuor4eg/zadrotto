import { formatScore } from "@/lib/ratings/score";
import { AUTHOR_RATING_TONE_CLASS_NAMES, getRatingTone } from "@/lib/ratings/tone";

export function AuthorScoreBadge({ score, size = "default" }: { score: number | null; size?: "default" | "compact" }) {
  if (score === null) return null;
  return <span
    className={`inline-flex shrink-0 items-center justify-center rounded-full border font-mono tabular-nums shadow-sm ${size === "compact" ? "size-6 text-[11px]" : "size-9 text-sm sm:size-10 sm:text-base"} ${AUTHOR_RATING_TONE_CLASS_NAMES[getRatingTone(score)]}`}
    aria-label={`Оценка автора: ${formatScore(score)}`}
  >{formatScore(score)}</span>;
}
