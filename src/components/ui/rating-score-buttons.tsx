"use client";

import type { ButtonHTMLAttributes } from "react";

import { cn } from "@/lib/common/utils";
import {
  getRatingTone,
  RATING_BUTTON_TONE_CLASS_NAMES,
  SELECTED_RATING_BUTTON_TONE_CLASS_NAMES,
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
}: RatingScoreButtonsProps) {
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
    <div className={cn(ratingButtonGridClassName, className)} aria-label={ariaLabel}>
      {RATING_BUTTON_SCORES.map((score) => {
        const isSelected = selectedScore === score;
        const ratingTone = getRatingTone(score);
        const buttonProps = getButtonProps?.(score, { isSelected }) ?? { type: "button" as const };

        return (
          <button
            key={score}
            {...buttonProps}
            type={buttonProps.type ?? "button"}
            disabled={disabled}
            className={`border font-semibold tabular-nums transition-colors disabled:border-zinc-200 disabled:bg-zinc-100 disabled:text-zinc-400 ${ratingButtonSizeClassName} ${
              isSelected
                ? variant === "archive"
                  ? SELECTED_RATING_BUTTON_TONE_CLASS_NAMES[ratingTone]
                  : "border-zinc-950 bg-zinc-950 text-white"
                : variant === "archive"
                  ? RATING_BUTTON_TONE_CLASS_NAMES[ratingTone]
                  : "border-zinc-300 bg-white text-zinc-700 hover:border-zinc-950 hover:text-zinc-950"
            }`}
            onClick={() => onScoreClick(score, { isSelected })}
          >
            {score / 10}
          </button>
        );
      })}
    </div>
  );
}
