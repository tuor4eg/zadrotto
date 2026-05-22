"use client";

import Link from "next/link";
import { useActionState, useEffect, useRef, useState } from "react";

import { saveAuthorRatingAction, type SaveAuthorRatingState } from "@/app/ratings/actions";
import { ArchiveSelect } from "@/components/ui/archive-select";
import {
  FIRST_EXPERIENCED_PRECISION_LABELS,
  FIRST_EXPERIENCED_PRECISIONS,
  type FirstExperiencedPrecision,
} from "@/lib/author-media-experiences";
import { formatFirstExperiencedInputValue } from "@/lib/experience-date";
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
  currentAuthorFirstExperiencedAt?: Date | string | null;
  currentAuthorFirstExperiencedPrecision?: FirstExperiencedPrecision | null;
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

const RATING_BUTTON_SCORES = Array.from({ length: 10 }, (_, index) => (index + 1) * 10);
const MONTH_OPTIONS = [
  "Январь",
  "Февраль",
  "Март",
  "Апрель",
  "Май",
  "Июнь",
  "Июль",
  "Август",
  "Сентябрь",
  "Октябрь",
  "Ноябрь",
  "Декабрь",
] as const;
const MIN_EXPERIENCE_YEAR = 1950;
const DATE_SELECT_CLASS_NAME =
  "w-full [&>button]:h-11 [&>button]:w-full [&>button]:min-w-0 [&>button]:justify-between [&>button]:px-3";

function padDatePart(value: number) {
  return String(value).padStart(2, "0");
}

function getExperienceParts(value: string) {
  const [rawYear = "", rawMonth = "", rawDay = ""] = value.split("-");
  const year = /^\d{4}$/.test(rawYear) ? rawYear : "";
  const month = /^(0[1-9]|1[0-2])$/.test(rawMonth) ? rawMonth : "01";
  const day = /^(0[1-9]|[12]\d|3[01])$/.test(rawDay) ? rawDay : "01";

  return { day, month, year };
}

function getDaysInMonth(year: string, month: string) {
  const numericYear = Number(year || "2000");
  const numericMonth = Number(month || "01");

  return new Date(numericYear, numericMonth, 0).getDate();
}

function buildExperienceValue(input: {
  day: string;
  month: string;
  precision: FirstExperiencedPrecision;
  year: string;
}) {
  if (!/^\d{4}$/.test(input.year)) {
    return "";
  }

  if (input.precision === "year") {
    return input.year;
  }

  if (input.precision === "month") {
    return `${input.year}-${input.month}`;
  }

  return `${input.year}-${input.month}-${input.day}`;
}

export function AuthorRatingForm({
  mediaItemCode,
  franchiseCode,
  currentAuthor,
  currentAuthorScore,
  currentAuthorFirstExperiencedAt = null,
  currentAuthorFirstExperiencedPrecision = null,
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
  const initialExperiencePrecision = currentAuthorFirstExperiencedPrecision ?? "year";
  const initialExperienceValue = formatFirstExperiencedInputValue(
    currentAuthorFirstExperiencedAt,
    initialExperiencePrecision,
  );
  const [selectedExperiencePrecision, setSelectedExperiencePrecision] =
    useState<FirstExperiencedPrecision>(initialExperiencePrecision);
  const [selectedExperienceValue, setSelectedExperienceValue] = useState(initialExperienceValue);
  const autoSubmitScoreInputRef = useRef<HTMLInputElement>(null);
  const wasPendingRef = useRef(false);
  const visibleSelectedScore =
    selectedScore ?? (currentAuthorScore !== null && currentAuthorScore % 10 === 0
      ? currentAuthorScore
      : null);
  const hasUnsavedScore = selectedScore !== null && selectedScore !== currentAuthorScore;
  const hasUnsavedExperience =
    showExperienceFields &&
    (selectedExperiencePrecision !== initialExperiencePrecision ||
      selectedExperienceValue !== initialExperienceValue);

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
  const experienceParts = getExperienceParts(selectedExperienceValue);
  const currentYear = new Date().getFullYear();
  const yearOptions = Array.from(
    { length: currentYear - MIN_EXPERIENCE_YEAR + 1 },
    (_, index) => String(currentYear - index),
  );
  const visibleYearOptions =
    experienceParts.year && !yearOptions.includes(experienceParts.year)
      ? [experienceParts.year, ...yearOptions]
      : yearOptions;
  const yearSelectOptions = [
    { label: "Год", value: "" },
    ...visibleYearOptions.map((year) => ({ label: year, value: year })),
  ];
  const monthDayCount = getDaysInMonth(experienceParts.year, experienceParts.month);
  const monthSelectOptions = MONTH_OPTIONS.map((month, index) => {
    const value = padDatePart(index + 1);

    return { label: month, value };
  });
  const daySelectOptions = Array.from({ length: monthDayCount }, (_, index) => {
    const value = padDatePart(index + 1);

    return { label: String(index + 1), value };
  });
  const precisionSelectOptions = FIRST_EXPERIENCED_PRECISIONS.map((precision) => ({
    label: FIRST_EXPERIENCED_PRECISION_LABELS[precision],
    value: precision,
  }));

  function updateExperienceValue(nextParts: Partial<typeof experienceParts>) {
    const mergedParts = { ...experienceParts, ...nextParts };
    const normalizedDay = String(
      Math.min(Number(mergedParts.day), getDaysInMonth(mergedParts.year, mergedParts.month)),
    ).padStart(2, "0");

    setSelectedExperienceValue(
      buildExperienceValue({
        ...mergedParts,
        day: normalizedDay,
        precision: selectedExperiencePrecision,
      }),
    );
  }

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
      {showExperienceFields ? (
        <>
          <input type="hidden" name="firstExperiencedValue" value={selectedExperienceValue} />
          <input
            type="hidden"
            name="firstExperiencedPrecision"
            value={selectedExperiencePrecision}
          />
        </>
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
          <div className={ratingButtonGridClassName} aria-label="Оценка">
            {RATING_BUTTON_SCORES.map((score) => {
              const isSelected = visibleSelectedScore === score;
              const isSavedSelectedScore = isSelected && currentAuthorScore === score;
              const ratingTone = getRatingTone(score);

              return (
                <button
                  key={score}
                  type={autoSubmitOnSelect || isSavedSelectedScore ? "submit" : "button"}
                  name={autoSubmitOnSelect || isSavedSelectedScore ? "intent" : undefined}
                  value={
                    isSavedSelectedScore || (autoSubmitOnSelect && isSelected)
                      ? "delete"
                      : "save"
                  }
                  onClick={() => {
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
          <div
            className={`grid gap-3 border-t pt-4 ${
              variant === "archive" ? "border-stone-300/80" : "border-zinc-200"
            }`}
          >
            <span
              className={`block text-[10px] font-semibold uppercase tracking-[0.16em] ${
                variant === "archive" ? "text-stone-500" : "text-zinc-400"
              }`}
            >
              Первое знакомство
            </span>
            <div className="grid gap-2 sm:grid-cols-[minmax(0,1fr)_160px]">
              <div
                className={`grid gap-2 ${
                  selectedExperiencePrecision === "year"
                    ? ""
                    : selectedExperiencePrecision === "month"
                      ? "sm:grid-cols-[minmax(0,1fr)_minmax(0,1fr)]"
                      : "sm:grid-cols-[minmax(0,1fr)_minmax(0,1fr)_minmax(0,1fr)]"
                }`}
              >
                <ArchiveSelect
                  ariaLabel="Год знакомства"
                  className={DATE_SELECT_CLASS_NAME}
                  compact={false}
                  options={yearSelectOptions}
                  value={experienceParts.year}
                  onChange={(year) => updateExperienceValue({ year })}
                />
                {selectedExperiencePrecision !== "year" ? (
                  <ArchiveSelect
                    ariaLabel="Месяц знакомства"
                    className={DATE_SELECT_CLASS_NAME}
                    compact={false}
                    options={monthSelectOptions}
                    value={experienceParts.month}
                    onChange={(month) => updateExperienceValue({ month })}
                  />
                ) : null}
                {selectedExperiencePrecision === "day" ? (
                  <ArchiveSelect
                    ariaLabel="День знакомства"
                    className={DATE_SELECT_CLASS_NAME}
                    compact={false}
                    options={daySelectOptions}
                    value={experienceParts.day}
                    onChange={(day) => updateExperienceValue({ day })}
                  />
                ) : null}
              </div>
              <ArchiveSelect
                ariaLabel="Точность даты знакомства"
                className={DATE_SELECT_CLASS_NAME}
                compact={false}
                options={precisionSelectOptions}
                value={selectedExperiencePrecision}
                onChange={(nextPrecision) => {
                  setSelectedExperiencePrecision(nextPrecision);
                  setSelectedExperienceValue(
                    buildExperienceValue({
                      ...experienceParts,
                      precision: nextPrecision,
                    }),
                  );
                }}
              />
            </div>
          </div>
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
