export const FIRST_EXPERIENCED_PRECISIONS = ["year", "month", "day"] as const;

export type FirstExperiencedPrecision = (typeof FIRST_EXPERIENCED_PRECISIONS)[number];

export const FIRST_EXPERIENCED_PRECISION_LABELS: Record<FirstExperiencedPrecision, string> = {
  year: "Год",
  month: "Месяц и год",
  day: "Точная дата",
};
