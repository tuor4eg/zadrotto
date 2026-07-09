"use client";

import { useEffect, useState } from "react";

import { ArchiveSelect } from "@/components/ui/archive-select";
import {
  FIRST_EXPERIENCED_PRECISION_LABELS,
  FIRST_EXPERIENCED_PRECISIONS,
  type FirstExperiencedPrecision,
} from "@/lib/authors/media-experiences";
import {
  buildFirstExperiencedYearOptions,
  formatFirstExperiencedInputValue,
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
  "w-full [&>button]:h-11 [&>button]:w-full [&>button]:min-w-0 [&>button]:justify-between [&>button]:px-3";

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
  const initialExperiencePrecision = currentFirstExperiencedPrecision ?? "year";
  const initialExperienceValue = formatFirstExperiencedInputValue(
    currentFirstExperiencedAt,
    initialExperiencePrecision,
  );
  const [selectedExperiencePrecision, setSelectedExperiencePrecision] =
    useState<FirstExperiencedPrecision>(initialExperiencePrecision);
  const [selectedExperienceValue, setSelectedExperienceValue] = useState(initialExperienceValue);
  const currentYear = new Date().getFullYear();
  const experienceParts = getExperienceParts(selectedExperienceValue);
  const visibleExperienceParts = {
    ...experienceParts,
    year: experienceParts.year || String(currentYear),
  };
  const submittedExperienceValue =
    selectedExperienceValue ||
    buildExperienceValue({
      ...visibleExperienceParts,
      precision: selectedExperiencePrecision,
    });
  const hasUnsavedExperience =
    selectedExperiencePrecision !== initialExperiencePrecision ||
    selectedExperienceValue !== initialExperienceValue;
  const visibleYearOptions = buildFirstExperiencedYearOptions({
    currentYear,
    minYear: MIN_EXPERIENCE_YEAR,
    releaseYear,
    selectedYear: experienceParts.year,
  });
  const yearSelectOptions = visibleYearOptions.map((year) => ({ label: year, value: year }));
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
  const precisionSelectOptions = FIRST_EXPERIENCED_PRECISIONS.map((precision) => ({
    label: FIRST_EXPERIENCED_PRECISION_LABELS[precision],
    value: precision,
  }));

  useEffect(() => {
    onDirtyChange?.(hasUnsavedExperience);
  }, [hasUnsavedExperience, onDirtyChange]);

  function updateExperienceValue(nextParts: Partial<typeof experienceParts>) {
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
            value={visibleExperienceParts.year}
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
                ...visibleExperienceParts,
                precision: nextPrecision,
              }),
            );
          }}
        />
      </div>
    </div>
  );
}
