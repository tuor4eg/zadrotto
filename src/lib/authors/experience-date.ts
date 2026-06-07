import moment from "moment";
import "moment/locale/ru";

import {
  FIRST_EXPERIENCED_PRECISIONS,
  type FirstExperiencedPrecision,
} from "@/lib/authors/media-experiences";

moment.locale("ru");

export function formatFirstExperiencedDate(
  date: Date | string | null,
  precision: FirstExperiencedPrecision | null,
) {
  if (!date || !precision) {
    return null;
  }

  const value =
    typeof date === "string" ? moment(date, moment.ISO_8601, true) : moment(date);

  if (!value.isValid()) {
    return null;
  }

  if (precision === "year") {
    return value.format("YYYY");
  }

  if (precision === "month") {
    return value.format("MMMM YYYY");
  }

  return value.format("D MMMM YYYY");
}

export function formatFirstExperiencedInputValue(
  date: Date | string | null,
  precision: FirstExperiencedPrecision | null,
) {
  if (!date || !precision) {
    return "";
  }

  const value =
    typeof date === "string" ? moment(date, moment.ISO_8601, true) : moment(date);

  if (!value.isValid()) {
    return "";
  }

  if (precision === "year") {
    return value.format("YYYY");
  }

  if (precision === "month") {
    return value.format("YYYY-MM");
  }

  return value.format("YYYY-MM-DD");
}

export function isFirstExperiencedPrecision(
  value: string,
): value is FirstExperiencedPrecision {
  return FIRST_EXPERIENCED_PRECISIONS.some((precision) => precision === value);
}

export function parseFirstExperiencedInput(
  value: string,
  precision: string,
):
  | { firstExperiencedAt: string; firstExperiencedPrecision: FirstExperiencedPrecision }
  | null {
  const normalizedValue = value.trim();
  const normalizedPrecision = precision.trim();

  if (!normalizedValue && !normalizedPrecision) {
    return null;
  }

  if (!isFirstExperiencedPrecision(normalizedPrecision)) {
    return null;
  }

  const formats: Record<FirstExperiencedPrecision, string> = {
    year: "YYYY",
    month: "YYYY-MM",
    day: "YYYY-MM-DD",
  };
  const parsed = moment(normalizedValue, formats[normalizedPrecision], true);

  if (!parsed.isValid()) {
    return null;
  }

  return {
    firstExperiencedAt: parsed.format("YYYY-MM-DD"),
    firstExperiencedPrecision: normalizedPrecision,
  };
}
