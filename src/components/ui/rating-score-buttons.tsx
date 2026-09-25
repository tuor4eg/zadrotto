"use client";

import { useState, type ButtonHTMLAttributes } from "react";

import { cn } from "@/lib/common/utils";
import {
  AUTHOR_RATING_TONE_CLASS_NAMES,
  getRatingTone,
  RATING_BUTTON_TONE_CLASS_NAMES,
} from "@/lib/ratings/tone";

type RatingScoreButtonProps = Pick<ButtonHTMLAttributes<HTMLButtonElement>, "name" | "type" | "value">;

type RatingScoreButtonsProps = {
  ariaLabel?: string;
  className?: string;
  compact?: boolean;
  disabled?: boolean;
  selectedScore: number | null;
  variant?: "default" | "archive";
  getButtonProps?: (score: number, input: { isSelected: boolean }) => RatingScoreButtonProps;
  onScoreClick: (score: number, input: { isSelected: boolean }) => void;
  progressive?: boolean;
};

export const RATING_BUTTON_SCORES = Array.from({ length: 10 }, (_, index) => (index + 1) * 10);

export function RatingScoreButtons({
  ariaLabel = "Оценка",
  className,
  compact = false,
  disabled = false,
  selectedScore,
  variant = "default",
  getButtonProps,
  onScoreClick,
  progressive = false,
}: RatingScoreButtonsProps) {
  const [hoveredScore, setHoveredScore] = useState<number | null>(null);
  const visibleProgressiveScore = hoveredScore ?? selectedScore;
  const ratingButtonGridClassName =
    variant === "archive"
      ? "grid min-w-0 flex-1 grid-cols-5 gap-2 sm:grid-cols-10"
      : `grid min-w-0 flex-1 grid-cols-10 ${compact ? "gap-px" : "gap-1"}`;
  const ratingButtonSizeClassName =
    variant === "archive"
      ? "h-11 rounded-md text-sm"
      : compact
        ? "h-7 text-[11px]"
        : "h-9 text-sm";

  return (
    <div
      className={cn(ratingButtonGridClassName, className)}
      aria-label={ariaLabel}
      onPointerLeave={() => setHoveredScore(null)}
    >
      {RATING_BUTTON_SCORES.map((score) => {
        const isSelected = selectedScore === score;
        const isProgressivelyFilled = progressive && visibleProgressiveScore !== null && score <= visibleProgressiveScore;
        const ratingTone = getRatingTone(score);
        const buttonProps = getButtonProps?.(score, { isSelected }) ?? { type: "button" as const };

        return (
          <button
            key={score}
            {...buttonProps}
            type={buttonProps.type ?? "button"}
            disabled={disabled}
            className={`border font-semibold tabular-nums transition-colors disabled:border-zinc-200 disabled:bg-zinc-100 disabled:text-zinc-400 ${ratingButtonSizeClassName} ${
              isProgressivelyFilled
                ? AUTHOR_RATING_TONE_CLASS_NAMES[ratingTone]
                : isSelected
                ? AUTHOR_RATING_TONE_CLASS_NAMES[ratingTone]
                : progressive
                  ? "border-stone-300/80 bg-stone-50/80 text-stone-700 hover:border-stone-400 hover:bg-stone-50"
                : variant === "archive"
                  ? RATING_BUTTON_TONE_CLASS_NAMES[ratingTone]
                  : "border-zinc-300 bg-white text-zinc-700 hover:border-zinc-950 hover:text-zinc-950"
            }`}
            onPointerEnter={() => {
              if (progressive) setHoveredScore(score);
            }}
            onClick={() => onScoreClick(score, { isSelected })}
          >
            {score / 10}
          </button>
        );
      })}
    </div>
  );
}
