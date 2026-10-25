/** Storage fields are shared; their meaning follows the Creator type. */
export function creatorDateLabels(typeCode: string) {
  return typeCode === "organization"
    ? { start: "Дата создания", end: "Дата закрытия" }
    : { start: "Дата рождения", end: "Дата смерти" };
}

export function creatorEditErrorMessage(code: string) {
  if (code === "type-in-use") return "Нельзя изменить тип создателя с привязками провайдеров, участиями, связями псевдонима или импортированным изображением. Сначала разберите эти связи.";
  if (code === "dates") return "Проверьте полные календарные даты и их порядок. Дата окончания не может быть раньше начала. Даты персоны недоступны при исходящей связи псевдонима.";
  return "Не удалось сохранить создателя. Проверьте поля и уникальность slug.";
}

export type CreatorLocalizationFilter = "" | "localized" | "ai";
export function parseCreatorLocalizationFilter(value: string | undefined): CreatorLocalizationFilter {
  return value === "localized" || value === "ai" ? value : "";
}

export const CREATOR_PROVIDER_FILTER_CODES = ["fantlab", "bgg", "tmdb", "igdb", "rawg", "google-books", "open-library"] as const;
export type CreatorProviderFilter = "" | typeof CREATOR_PROVIDER_FILTER_CODES[number];
export function parseCreatorProviderFilter(value: string | undefined): CreatorProviderFilter {
  return CREATOR_PROVIDER_FILTER_CODES.find(code => code === value) ?? "";
}
