"use client";

import Link from "next/link";
import { useActionState, useEffect, useRef, useState, useTransition } from "react";

import { saveAuthorRatingAction, type SaveAuthorRatingState } from "@/app/ratings/actions";
import { RatingExperienceFields } from "@/components/ui/rating-experience-fields";
import { RatingScoreButtons } from "@/components/ui/rating-score-buttons";
import {
  isFirstExperienceBeforeRelease,
  parseFirstExperiencedInput,
} from "@/lib/authors/experience-date";
import type { FirstExperiencedPrecision } from "@/lib/authors/media-experiences";
import { ARCHIVE_ONBOARDING_RATING_SAVED_EVENT } from "@/lib/onboarding/model";
import { deleteDemoRating, upsertDemoRating } from "@/lib/user-state/demo-actions";
import { useDemoMediaOverlay } from "@/lib/user-state/use-demo-media-overlay";
import { useDemoProfile } from "@/lib/user-state/use-demo-profile";

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

const DEMO_AUTHOR = {
  name: "Гость",
  code: "demo",
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
  const demoProfile = useDemoProfile();
  const hasRealAuthor = Boolean(currentAuthor && currentAuthor.code !== "demo");
  const isDemo = Boolean(
    demoProfile && demoProfile.import.importedAt == null && !hasRealAuthor,
  );
  const demoOverlay = useDemoMediaOverlay(mediaItemCode, currentAuthorScore, null);
  const effectiveAuthor = hasRealAuthor ? currentAuthor : isDemo ? DEMO_AUTHOR : null;
  const effectiveScore = hasRealAuthor ? currentAuthorScore : demoOverlay.score;
  const effectiveFirstExperiencedAt = hasRealAuthor
    ? currentAuthorFirstExperiencedAt
    : demoOverlay.firstExperiencedAt;
  const effectiveFirstExperiencedPrecision = hasRealAuthor
    ? currentAuthorFirstExperiencedPrecision
    : demoOverlay.firstExperiencedPrecision;

  const [state, formAction, isPending] = useActionState(saveAuthorRatingAction, initialState);
  const [demoError, setDemoError] = useState<string | null>(null);
  const [demoPending, startDemoTransition] = useTransition();
  const [selectedScore, setSelectedScore] = useState<number | null>(null);
  const [hasUnsavedExperience, setHasUnsavedExperience] = useState(false);
  const autoSubmitScoreInputRef = useRef<HTMLInputElement>(null);
  const wasPendingRef = useRef(false);
  const pending = isDemo ? demoPending : isPending;
  const visibleSelectedScore =
    selectedScore ?? (effectiveScore !== null && effectiveScore % 10 === 0
      ? effectiveScore
      : null);
  const hasUnsavedScore = selectedScore !== null && selectedScore !== effectiveScore;

  useEffect(() => {
    onScoreChange?.(hasUnsavedScore);
  }, [hasUnsavedScore, onScoreChange]);

  useEffect(() => {
    if (isDemo) return
    if (wasPendingRef.current && !isPending && state.error === null) {
      onSaved?.();
      window.dispatchEvent(new Event(ARCHIVE_ONBOARDING_RATING_SAVED_EVENT));
    }

    wasPendingRef.current = isPending;
  }, [isDemo, isPending, onSaved, state.error]);

  const contentGapClassName =
    showExperienceFields ? "gap-5" : showLabel ? "gap-3" : "";

  function saveDemoRating(
    intent: "save" | "delete",
    scoreValue: number | null,
    formData?: FormData,
  ) {
    startDemoTransition(() => {
      try {
        setDemoError(null);
        if (intent === "delete") {
          deleteDemoRating(mediaItemCode);
        } else if (scoreValue != null) {
          let experience: {
            experiencedAt: string | null
            precision: FirstExperiencedPrecision | null
          } | null | undefined
          if (showExperienceFields && formData) {
            const rawValue = String(formData.get("firstExperiencedValue") ?? "").trim()
            const rawPrecision = String(formData.get("firstExperiencedPrecision") ?? "").trim()
            if (rawValue) {
              const parsed = parseFirstExperiencedInput(rawValue, rawPrecision)
              if (!parsed) {
                setDemoError("Проверь дату знакомства.")
                return
              }
              if (isFirstExperienceBeforeRelease({
                firstExperiencedAt: parsed.firstExperiencedAt,
                releaseYear,
              })) {
                setDemoError("Год знакомства не может быть раньше года выхода.")
                return
              }
              experience = {
                experiencedAt: parsed.firstExperiencedAt,
                precision: parsed.firstExperiencedPrecision,
              }
            } else {
              experience = null
            }
          }
          upsertDemoRating(mediaItemCode, scoreValue, experience);
        } else {
          setDemoError("Выбери оценку.");
          return;
        }
        setSelectedScore(null);
        onSaved?.();
        window.dispatchEvent(new Event(ARCHIVE_ONBOARDING_RATING_SAVED_EVENT));
      } catch (error) {
        setDemoError(error instanceof Error ? error.message : "Не удалось сохранить оценку.");
      }
    });
  }

  if (!effectiveAuthor) {
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

  const error = isDemo ? demoError : state.error;

  return (
    <div>
      <form
        id={formId}
        action={isDemo ? undefined : formAction}
        onSubmit={isDemo ? (event) => {
          event.preventDefault();
          const formData = new FormData(event.currentTarget);
          const intent = String(formData.get("intent") ?? "save");
          if (intent === "delete") {
            saveDemoRating("delete", effectiveScore);
            return;
          }
          const rawScore = formData.get("score");
          const parsed = typeof rawScore === "string" && rawScore.trim()
            ? Math.round(Number(rawScore.replace(",", ".")) * 10)
            : selectedScore;
          saveDemoRating("save", parsed, formData);
        } : undefined}
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
      ) : showExperienceFields && effectiveScore !== null ? (
        <input type="hidden" name="score" value={effectiveScore / 10} />
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
            disabled={pending}
            selectedScore={visibleSelectedScore}
            variant={variant}
            getButtonProps={(score, { isSelected }) => {
              const isSavedSelectedScore = isSelected && effectiveScore === score;

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
              disabled={pending}
              title="Сохранить оценку"
              aria-label="Сохранить оценку"
              className={`flex items-center justify-center border font-semibold leading-none transition-colors disabled:border-zinc-300 disabled:bg-zinc-200 disabled:text-zinc-400 ${saveButtonClassName} ${
                variant === "archive"
                  ? "border-stone-950 bg-stone-950 text-stone-50 hover:bg-stone-50 hover:text-stone-950"
                  : "border-zinc-950 bg-zinc-950 text-white hover:bg-white hover:text-zinc-950"
              }`}
            >
              {pending ? "..." : variant === "archive" ? "Сохранить" : "✓"}
            </button>
          ) : null}
        </div>

        {showExperienceFields ? (
          <RatingExperienceFields
            currentFirstExperiencedAt={effectiveFirstExperiencedAt}
            currentFirstExperiencedPrecision={effectiveFirstExperiencedPrecision}
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
            disabled={pending}
            title="Сохранить оценку"
            aria-label="Сохранить оценку"
            className={`flex items-center justify-center border font-semibold leading-none transition-colors disabled:border-zinc-300 disabled:bg-zinc-200 disabled:text-zinc-400 ${saveButtonClassName} ${
              variant === "archive"
                ? "border-stone-950 bg-stone-950 text-stone-50 hover:bg-stone-50 hover:text-stone-950"
                : "border-zinc-950 bg-zinc-950 text-white hover:bg-white hover:text-zinc-950"
            }`}
          >
            {pending ? "..." : variant === "archive" ? "Сохранить" : "✓"}
          </button>
        ) : null}

        {error ? <p className="text-xs text-red-700">{error}</p> : null}
        </div>
      </form>
    </div>
  );
}
