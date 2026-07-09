"use client";

import Link from "next/link";
import { useActionState, useEffect, useRef, useState } from "react";

import { saveAuthorRatingAction, type SaveAuthorRatingState } from "@/app/ratings/actions";
import { RatingExperienceFields } from "@/components/ui/rating-experience-fields";
import { RatingScoreButtons } from "@/components/ui/rating-score-buttons";
import type { FirstExperiencedPrecision } from "@/lib/authors/media-experiences";

type AuthorRatingFormProps = {
  mediaItemCode: string;
  franchiseCode?: string | null;
  currentAuthor: {
    name: string;
    code: string;
  } | null;
  currentAuthorScore: number | null;
  currentAuthorFirstExperiencedAt?: Date | string | null;
  currentAuthorFirstExperiencedPrecision?: FirstExperiencedPrecision | null;
  releaseYear?: number | null;
  compact?: boolean;
  variant?: "default" | "archive";
  autoSubmitOnSelect?: boolean;
  inlineSaveButton?: boolean;
  showLabel?: boolean;
  showExperienceFields?: boolean;
  onSaved?: () => void;
  onScoreChange?: (hasUnsaved: boolean) => void;
  formId?: string;
};

const initialState: SaveAuthorRatingState = {
  error: null,
};

export function AuthorRatingForm({
  mediaItemCode,
  franchiseCode,
  currentAuthor,
  currentAuthorScore,
  currentAuthorFirstExperiencedAt = null,
  currentAuthorFirstExperiencedPrecision = null,
  releaseYear = null,
  compact = false,
  variant = "default",
  autoSubmitOnSelect = false,
  inlineSaveButton = true,
  showLabel = true,
  showExperienceFields = false,
  onSaved,
  onScoreChange,
  formId,
}: AuthorRatingFormProps) {
  const [state, formAction, isPending] = useActionState(saveAuthorRatingAction, initialState);
  const [selectedScore, setSelectedScore] = useState<number | null>(null);
  const [hasUnsavedExperience, setHasUnsavedExperience] = useState(false);
  const autoSubmitScoreInputRef = useRef<HTMLInputElement>(null);
  const wasPendingRef = useRef(false);
  const visibleSelectedScore =
    selectedScore ?? (currentAuthorScore !== null && currentAuthorScore % 10 === 0
      ? currentAuthorScore
      : null);
  const hasUnsavedScore = selectedScore !== null && selectedScore !== currentAuthorScore;

  useEffect(() => {
    onScoreChange?.(hasUnsavedScore);
  }, [hasUnsavedScore, onScoreChange]);

  useEffect(() => {
    if (wasPendingRef.current && !isPending && state.error === null) {
      onSaved?.();
    }

    wasPendingRef.current = isPending;
  }, [isPending, onSaved, state.error]);
  const contentGapClassName =
    showExperienceFields ? "gap-5" : showLabel ? "gap-3" : "";

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
        lang="ru-RU"
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
      ) : showExperienceFields && currentAuthorScore !== null ? (
        <input type="hidden" name="score" value={currentAuthorScore / 10} />
      ) : null}

      <div className={`flex flex-col ${contentGapClassName}`}>
        {showLabel ? (
          <div>
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
          <RatingScoreButtons
            compact={compact}
            disabled={isPending}
            selectedScore={visibleSelectedScore}
            variant={variant}
            getButtonProps={(score, { isSelected }) => {
              const isSavedSelectedScore = isSelected && currentAuthorScore === score;

              return {
                type: autoSubmitOnSelect || isSavedSelectedScore ? "submit" : "button",
                name: autoSubmitOnSelect || isSavedSelectedScore ? "intent" : undefined,
                value:
                  isSavedSelectedScore || (autoSubmitOnSelect && isSelected)
                    ? "delete"
                    : "save",
              };
            }}
            onScoreClick={(score, { isSelected }) => {
              if (autoSubmitOnSelect && autoSubmitScoreInputRef.current) {
                autoSubmitScoreInputRef.current.value = String(score / 10);
                return;
              }

              if (isSelected) {
                setSelectedScore(null);
                return;
              }

              setSelectedScore(score);
            }}
          />

          {hasUnsavedScore && inlineSaveButton && !showExperienceFields ? (
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

        {showExperienceFields ? (
          <RatingExperienceFields
            currentFirstExperiencedAt={currentAuthorFirstExperiencedAt}
            currentFirstExperiencedPrecision={currentAuthorFirstExperiencedPrecision}
            releaseYear={releaseYear}
            variant={variant}
            onDirtyChange={setHasUnsavedExperience}
          />
        ) : null}

        {(hasUnsavedScore || hasUnsavedExperience) && inlineSaveButton ? (
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

        {state.error ? <p className="text-xs text-red-700">{state.error}</p> : null}
        </div>
      </form>
    </div>
  );
}
