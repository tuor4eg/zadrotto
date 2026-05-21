"use client";

import Link from "next/link";
import { useActionState, useEffect, useRef, useState } from "react";

import { saveAuthorRatingAction, type SaveAuthorRatingState } from "@/app/ratings/actions";
import {
  getRatingTone,
  RATING_BUTTON_TONE_CLASS_NAMES,
  SELECTED_RATING_BUTTON_TONE_CLASS_NAMES,
} from "@/lib/rating-tone";

type AuthorRatingFormProps = {
  mediaItemCode: string;
  franchiseCode?: string | null;
  currentAuthor: {
    name: string;
    code: string;
  } | null;
  currentAuthorScore: number | null;
  compact?: boolean;
  variant?: "default" | "archive";
  autoSubmitOnSelect?: boolean;
  inlineSaveButton?: boolean;
  showLabel?: boolean;
  onScoreChange?: (hasUnsaved: boolean) => void;
  formId?: string;
};

const initialState: SaveAuthorRatingState = {
  error: null,
};

const RATING_BUTTON_SCORES = Array.from({ length: 10 }, (_, index) => (index + 1) * 10);

export function AuthorRatingForm({
  mediaItemCode,
  franchiseCode,
  currentAuthor,
  currentAuthorScore,
  compact = false,
  variant = "default",
  autoSubmitOnSelect = false,
  inlineSaveButton = true,
  showLabel = true,
  onScoreChange,
  formId,
}: AuthorRatingFormProps) {
  const [state, formAction, isPending] = useActionState(saveAuthorRatingAction, initialState);
  const [selectedScore, setSelectedScore] = useState<number | null>(null);
  const autoSubmitScoreInputRef = useRef<HTMLInputElement>(null);
  const visibleSelectedScore =
    selectedScore ?? (currentAuthorScore !== null && currentAuthorScore % 10 === 0
      ? currentAuthorScore
      : null);
  const hasUnsavedScore = selectedScore !== null && selectedScore !== currentAuthorScore;

  useEffect(() => {
    onScoreChange?.(hasUnsavedScore);
  }, [hasUnsavedScore, onScoreChange]);
  const hasSavedScore = currentAuthorScore !== null;
  const hasVisibleDeleteButton = hasSavedScore && !autoSubmitOnSelect;
  const contentGapClassName = hasVisibleDeleteButton ? "gap-5" : showLabel ? "gap-3" : "";

  if (!currentAuthor) {
    return (
      <div
        className={
          variant === "archive"
            ? "rounded-md border border-stone-300/80 bg-stone-50/50 px-3 py-2 text-sm text-stone-600"
            : "border border-zinc-200 px-3 py-2 text-sm text-zinc-500"
        }
      >
        <Link
          href="/author/login"
          className={
            variant === "archive"
              ? "font-medium text-stone-950 underline decoration-stone-400 underline-offset-4 transition-colors hover:decoration-stone-950"
              : "font-medium text-zinc-950 underline decoration-zinc-300 underline-offset-4 transition-colors hover:decoration-zinc-950"
          }
        >
          Войти как автор
        </Link>
        , чтобы поставить оценку.
      </div>
    );
  }

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
  const saveButtonClassName =
    variant === "archive"
      ? "h-11 rounded-md px-4 text-sm font-medium"
      : compact
        ? "h-7 w-7 text-sm"
        : "h-9 w-9 text-base";

  return (
    <div>
      <form
        id={formId}
        action={formAction}
        className={`relative ${
          variant === "archive"
            ? "rounded-md border border-stone-300/80 bg-stone-50/50"
            : "border border-zinc-200"
        } ${compact ? "p-2" : "p-3"}`}
      >
      <input type="hidden" name="mediaItemCode" value={mediaItemCode} />
      {franchiseCode ? <input type="hidden" name="franchiseCode" value={franchiseCode} /> : null}
      {autoSubmitOnSelect ? (
        <input ref={autoSubmitScoreInputRef} type="hidden" name="score" />
      ) : selectedScore !== null ? (
        <input type="hidden" name="score" value={selectedScore / 10} />
      ) : null}

      {hasVisibleDeleteButton ? (
        <button
          type="submit"
          name="intent"
          value="delete"
          disabled={isPending}
          title="Удалить мою оценку"
          aria-label="Удалить мою оценку"
          onClick={() => setSelectedScore(null)}
          className={`absolute right-3 top-3 flex items-center justify-center border font-semibold leading-none transition-colors hover:border-red-300 hover:text-red-700 disabled:bg-zinc-100 disabled:text-zinc-300 ${
            variant === "archive"
              ? "h-8 rounded-md border-stone-300/80 bg-stone-50/80 px-3 font-mono text-xs text-stone-500"
              : "border-zinc-200 bg-white text-zinc-400"
          } ${
            variant === "archive" ? "" : compact ? "h-6 w-6 text-xs" : "h-7 w-7 text-sm"
          }`}
        >
          {variant === "archive" ? "Удалить" : "Х"}
        </button>
      ) : null}

      <div className={`flex flex-col ${contentGapClassName}`}>
        {showLabel ? (
          <div className={hasVisibleDeleteButton ? "pr-10" : undefined}>
            <span
              className={`block text-[10px] font-semibold uppercase tracking-[0.16em] ${
                variant === "archive" ? "text-stone-500" : "text-zinc-400"
              }`}
            >
              Моя оценка
            </span>
          </div>
        ) : null}

        <div className="flex flex-wrap items-center gap-2">
          <div className={ratingButtonGridClassName} aria-label="Оценка">
            {RATING_BUTTON_SCORES.map((score) => {
              const isSelected = visibleSelectedScore === score;
              const ratingTone = getRatingTone(score);

              return (
                <button
                  key={score}
                  type={autoSubmitOnSelect ? "submit" : "button"}
                  name={autoSubmitOnSelect ? "intent" : undefined}
                  value={autoSubmitOnSelect && isSelected ? "delete" : "save"}
                  onClick={() => {
                    if (autoSubmitOnSelect && autoSubmitScoreInputRef.current) {
                      autoSubmitScoreInputRef.current.value = String(score / 10);
                      return;
                    }

                    setSelectedScore(score);
                  }}
                  disabled={isPending}
                  className={`border font-semibold tabular-nums transition-colors disabled:border-zinc-200 disabled:bg-zinc-100 disabled:text-zinc-400 ${ratingButtonSizeClassName} ${
                    isSelected
                      ? variant === "archive"
                        ? SELECTED_RATING_BUTTON_TONE_CLASS_NAMES[ratingTone]
                        : "border-zinc-950 bg-zinc-950 text-white"
                      : variant === "archive"
                        ? RATING_BUTTON_TONE_CLASS_NAMES[ratingTone]
                        : "border-zinc-300 bg-white text-zinc-700 hover:border-zinc-950 hover:text-zinc-950"
                  }`}
                >
                  {score / 10}
                </button>
              );
            })}
          </div>

          {hasUnsavedScore && inlineSaveButton ? (
            <button
              type="submit"
              name="intent"
              value="save"
              disabled={isPending}
              title="Сохранить оценку"
              aria-label="Сохранить оценку"
              className={`flex items-center justify-center border font-semibold leading-none transition-colors disabled:border-zinc-300 disabled:bg-zinc-200 disabled:text-zinc-400 ${saveButtonClassName} ${
                variant === "archive"
                  ? "border-stone-950 bg-stone-950 text-stone-50 hover:bg-stone-50 hover:text-stone-950"
                  : "border-zinc-950 bg-zinc-950 text-white hover:bg-white hover:text-zinc-950"
              }`}
            >
              {isPending ? "..." : variant === "archive" ? "Сохранить" : "✓"}
            </button>
          ) : null}
        </div>

        {state.error ? <p className="text-xs text-red-700">{state.error}</p> : null}
        </div>
      </form>
    </div>
  );
}
