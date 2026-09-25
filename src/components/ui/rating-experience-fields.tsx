"use client";

import { useEffect, useState } from "react";
import { ChevronDown } from "lucide-react";

import { ArchiveSelect } from "@/components/ui/archive-select";
import {
  FIRST_EXPERIENCED_PRECISION_LABELS,
  FIRST_EXPERIENCED_PRECISIONS,
  type FirstExperiencedPrecision,
} from "@/lib/authors/media-experiences";
import {
  buildFirstExperiencedYearOptions,
  getInitialFirstExperiencedInputValue,
} from "@/lib/authors/experience-date";

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
  "w-full [&>button]:h-11 [&>button]:w-full [&>button]:min-w-0 [&>button]:justify-between [&>button]:px-2 [&>button>span:first-child]:hidden";

type RatingExperienceFieldsProps = {
  currentFirstExperiencedAt?: Date | string | null;
  currentFirstExperiencedPrecision?: FirstExperiencedPrecision | null;
  releaseYear?: number | null;
  valueInputName?: string;
  precisionInputName?: string;
  variant?: "default" | "archive";
  onDirtyChange?: (hasUnsavedExperience: boolean) => void;
};

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

export function RatingExperienceFields({
  currentFirstExperiencedAt = null,
  currentFirstExperiencedPrecision = null,
  releaseYear = null,
  valueInputName = "firstExperiencedValue",
  precisionInputName = "firstExperiencedPrecision",
  variant = "default",
  onDirtyChange,
}: RatingExperienceFieldsProps) {
  const currentYear = new Date().getFullYear();
  const initialExperiencePrecision = currentFirstExperiencedPrecision ?? "year";
  const initialExperienceValue = getInitialFirstExperiencedInputValue({
    currentFirstExperiencedAt,
    currentFirstExperiencedPrecision: initialExperiencePrecision,
    currentYear,
    releaseYear,
  });
  const [selectedExperiencePrecision, setSelectedExperiencePrecision] =
    useState<FirstExperiencedPrecision>(initialExperiencePrecision);
  const [selectedExperienceValue, setSelectedExperienceValue] = useState(initialExperienceValue);
  const [isExpanded, setIsExpanded] = useState(false);
  const experienceParts = getExperienceParts(selectedExperienceValue);
  const visibleExperienceParts = {
    ...experienceParts,
    year: experienceParts.year || String(currentYear),
  };
  const submittedExperienceValue = selectedExperienceValue;
  const hasUnsavedExperience =
    selectedExperiencePrecision !== initialExperiencePrecision ||
    selectedExperienceValue !== initialExperienceValue;
  const visibleYearOptions = buildFirstExperiencedYearOptions({
    currentYear,
    minYear: MIN_EXPERIENCE_YEAR,
    releaseYear,
    selectedYear: experienceParts.year,
  });
  const yearSelectOptions = [
    { label: "Не указан", value: "" },
    ...visibleYearOptions.map((year) => ({ label: year, value: year })),
  ];
  const monthDayCount = getDaysInMonth(
    visibleExperienceParts.year,
    visibleExperienceParts.month,
  );
  const monthSelectOptions = MONTH_OPTIONS.map((month, index) => {
    const value = padDatePart(index + 1);

    return { label: month, value };
  });
  const daySelectOptions = Array.from({ length: monthDayCount }, (_, index) => {
    const value = padDatePart(index + 1);

    return { label: String(index + 1), value };
  });
  useEffect(() => {
    onDirtyChange?.(hasUnsavedExperience);
  }, [hasUnsavedExperience, onDirtyChange]);

  function updateExperienceValue(nextParts: Partial<typeof experienceParts>) {
    if (nextParts.year === "") {
      setSelectedExperienceValue("");
      return;
    }

    const mergedParts = { ...visibleExperienceParts, ...nextParts };
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

  function updateExperiencePrecision(nextPrecision: FirstExperiencedPrecision) {
    setSelectedExperiencePrecision(nextPrecision);
    if (selectedExperienceValue) {
      setSelectedExperienceValue(
        buildExperienceValue({
          ...visibleExperienceParts,
          precision: nextPrecision,
        }),
      );
    }
  }

  return (
    <div
      className={`grid gap-3 border-t pt-4 ${
        variant === "archive" ? "border-stone-300/80" : "border-zinc-200"
      }`}
    >
      <input type="hidden" name={valueInputName} value={submittedExperienceValue} />
      <input
        type="hidden"
        name={precisionInputName}
        value={selectedExperiencePrecision}
      />
      <button
        type="button"
        aria-expanded={isExpanded}
        className={`flex w-full items-center justify-between gap-3 text-left text-[10px] font-semibold uppercase tracking-[0.16em] transition-colors ${
          variant === "archive"
            ? "text-stone-500 hover:text-stone-950"
            : "text-zinc-400 hover:text-zinc-950"
        }`}
        onClick={() => setIsExpanded((expanded) => !expanded)}
      >
        <span>Первое знакомство</span>
        <ChevronDown
          aria-hidden="true"
          className={`size-4 transition-transform ${isExpanded ? "rotate-180" : ""}`}
        />
      </button>
      {isExpanded ? (
        <div className="grid gap-3">
      <div
        aria-label="Точность даты знакомства"
        className={`grid grid-cols-3 overflow-hidden rounded-md border ${
          variant === "archive" ? "border-stone-300/80" : "border-zinc-300"
        }`}
        role="group"
      >
        {FIRST_EXPERIENCED_PRECISIONS.map((precision) => {
          const isSelected = selectedExperiencePrecision === precision;

          return (
            <button
              key={precision}
              type="button"
              aria-pressed={isSelected}
              className={`h-9 border-r px-2 text-[10px] font-semibold uppercase tracking-[0.08em] transition-colors last:border-r-0 ${
                isSelected
                  ? variant === "archive"
                    ? "border-stone-700 bg-stone-700 text-stone-50"
                    : "border-zinc-800 bg-zinc-800 text-white"
                  : variant === "archive"
                    ? "border-stone-300/80 bg-stone-50/80 text-stone-600 hover:bg-stone-100"
                    : "border-zinc-300 bg-white text-zinc-600 hover:bg-zinc-100"
              }`}
              onClick={() => updateExperiencePrecision(precision)}
            >
              {FIRST_EXPERIENCED_PRECISION_LABELS[precision]}
            </button>
          );
        })}
      </div>
      <div
        className={`grid gap-2 ${
          selectedExperiencePrecision === "year"
            ? "grid-cols-1"
            : selectedExperiencePrecision === "month"
              ? "sm:grid-cols-2"
              : "sm:grid-cols-3"
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
              value={visibleExperienceParts.month}
              onChange={(month) => updateExperienceValue({ month })}
            />
          ) : null}
          {selectedExperiencePrecision === "day" ? (
            <ArchiveSelect
              ariaLabel="День знакомства"
              className={DATE_SELECT_CLASS_NAME}
              compact={false}
              options={daySelectOptions}
              value={visibleExperienceParts.day}
              onChange={(day) => updateExperienceValue({ day })}
            />
          ) : null}
      </div>
        </div>
      ) : null}
    </div>
  );
}
