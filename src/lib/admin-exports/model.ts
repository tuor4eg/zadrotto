export const ADMIN_EXPORT_ENTITY_TYPES = ["media_items", "series"] as const;
export type AdminExportEntityType = (typeof ADMIN_EXPORT_ENTITY_TYPES)[number];

type MetadataExportValueType = "date" | "number" | "string" | "string[]";

type MetadataExportFieldDefinition = {
  key: string;
  label: string;
  mediaTypes: "all" | readonly string[];
  valueType: MetadataExportValueType;
};

export const MEDIA_METADATA_EXPORT_FIELDS = [
  { key: "genres", label: "Жанры", mediaTypes: "all", valueType: "string[]" },
  { key: "runtimeMinutes", label: "Длительность, мин.", mediaTypes: ["film"], valueType: "number" },
  { key: "productionCountries", label: "Страны производства", mediaTypes: ["film"], valueType: "string[]" },
  { key: "originalLanguage", label: "Язык оригинала", mediaTypes: ["film"], valueType: "string" },
  { key: "productionCompanies", label: "Компании-производители", mediaTypes: ["film"], valueType: "string[]" },
  { key: "seasonCount", label: "Количество сезонов", mediaTypes: ["series"], valueType: "number" },
  { key: "episodeCount", label: "Количество эпизодов", mediaTypes: ["series", "anime"], valueType: "number" },
  { key: "averageEpisodeRuntimeMinutes", label: "Средняя длительность эпизода, мин.", mediaTypes: ["series", "anime"], valueType: "number" },
  { key: "networks", label: "Телеканалы и платформы", mediaTypes: ["series"], valueType: "string[]" },
  { key: "firstAirYear", label: "Год начала показа", mediaTypes: ["series"], valueType: "number" },
  { key: "lastAirYear", label: "Год окончания показа", mediaTypes: ["series"], valueType: "number" },
  { key: "status", label: "Статус", mediaTypes: ["anime"], valueType: "string" },
  { key: "animeType", label: "Формат аниме", mediaTypes: ["anime"], valueType: "string" },
  { key: "studios", label: "Студии", mediaTypes: ["anime"], valueType: "string[]" },
  { key: "platforms", label: "Платформы", mediaTypes: ["game"], valueType: "string[]" },
  { key: "developers", label: "Разработчики", mediaTypes: ["game"], valueType: "string[]" },
  { key: "publishers", label: "Издатели", mediaTypes: ["game"], valueType: "string[]" },
  { key: "authors", label: "Авторы", mediaTypes: ["book", "comic"], valueType: "string[]" },
  { key: "publisher", label: "Издатель", mediaTypes: ["comic"], valueType: "string" },
  { key: "issueCount", label: "Количество выпусков", mediaTypes: ["comic"], valueType: "number" },
  { key: "startYear", label: "Год начала выпуска", mediaTypes: ["comic"], valueType: "number" },
  { key: "creatorName", label: "Создатель", mediaTypes: ["roblox"], valueType: "string" },
  { key: "creatorType", label: "Тип создателя", mediaTypes: ["roblox"], valueType: "string" },
  { key: "createdAt", label: "Дата создания в Roblox", mediaTypes: ["roblox"], valueType: "date" },
  { key: "updatedAt", label: "Дата обновления в Roblox", mediaTypes: ["roblox"], valueType: "date" },
  { key: "genre", label: "Жанр Roblox", mediaTypes: ["roblox"], valueType: "string" },
  { key: "genreLevel1", label: "Категория жанра Roblox", mediaTypes: ["roblox"], valueType: "string" },
  { key: "genreLevel2", label: "Подкатегория жанра Roblox", mediaTypes: ["roblox"], valueType: "string" },
] as const satisfies readonly MetadataExportFieldDefinition[];

export type MediaMetadataExportField = (typeof MEDIA_METADATA_EXPORT_FIELDS)[number];
export type MediaMetadataExportKey = MediaMetadataExportField["key"];
export type MediaMetadataExportFieldKey = `metadata.${MediaMetadataExportKey}`;

export function getAvailableMetadataExportFields(mediaTypes: readonly string[]) {
  const selectedType = mediaTypes.length === 1 ? mediaTypes[0] : null;
  return MEDIA_METADATA_EXPORT_FIELDS.filter(
    (field) => field.mediaTypes === "all"
      || (selectedType !== null && (field.mediaTypes as readonly string[]).includes(selectedType)),
  );
}

export function getMetadataExportFieldKey(key: MediaMetadataExportKey): MediaMetadataExportFieldKey {
  return `metadata.${key}`;
}

export function getMetadataExportField(fieldKey: string): MediaMetadataExportField | null {
  if (!fieldKey.startsWith("metadata.")) return null;
  const key = fieldKey.slice("metadata.".length);
  return MEDIA_METADATA_EXPORT_FIELDS.find((field) => field.key === key) ?? null;
}

export function formatMetadataExportValue(
  field: MediaMetadataExportField,
  facts: Record<string, unknown> | null,
): string | number {
  const value = facts?.[field.key];
  if (field.valueType === "number") {
    return typeof value === "number" && Number.isFinite(value) ? value : "";
  }
  if (field.valueType === "string[]") {
    if (!Array.isArray(value)) return "";
    return value
      .filter((part): part is string => typeof part === "string")
      .map((part) => part.trim())
      .filter(Boolean)
      .join(" | ");
  }
  return typeof value === "string" && value.trim() ? value : "";
}

export const ADMIN_EXPORT_FIELDS = {
  media_items: [
    { key: "code", label: "Код", default: true }, { key: "title", label: "Название", default: true },
    { key: "originalTitle", label: "Оригинальное название", default: true }, { key: "aliases", label: "Псевдонимы", default: true },
    { key: "mediaType", label: "Тип", default: true }, { key: "carrier", label: "Носитель", default: true },
    { key: "releaseYear", label: "Год выпуска", default: true }, { key: "seriesTitles", label: "Названия серий", default: true },
    { key: "publicationStatus", label: "Статус публикации", default: true }, { key: "description", label: "Описание", default: false },
    { key: "seriesCodes", label: "Коды серий", default: false }, { key: "coverUrl", label: "URL обложки", default: false },
    { key: "author", label: "Автор добавления", default: false }, { key: "createdAt", label: "Дата создания", default: false },
    { key: "updatedAt", label: "Дата изменения", default: false },
  ],
  series: [
    { key: "code", label: "Код", default: true }, { key: "title", label: "Название", default: true },
    { key: "originalTitle", label: "Оригинальное название", default: true }, { key: "parentTitle", label: "Родительская серия", default: true },
    { key: "publicationStatus", label: "Статус публикации", default: true }, { key: "mediaItemsCount", label: "Количество записей", default: true },
    { key: "description", label: "Описание", default: false }, { key: "parentCode", label: "Код родительской серии", default: false },
    { key: "author", label: "Автор добавления", default: false }, { key: "createdAt", label: "Дата создания", default: false },
    { key: "updatedAt", label: "Дата изменения", default: false },
  ],
} as const;

type BaseAdminExportField<T extends AdminExportEntityType> = (typeof ADMIN_EXPORT_FIELDS)[T][number]["key"];
export type AdminExportField<T extends AdminExportEntityType> = BaseAdminExportField<T> | (T extends "media_items" ? MediaMetadataExportFieldKey : never);
export function getDefaultAdminExportFields<T extends AdminExportEntityType>(type: T): AdminExportField<T>[] {
  return ADMIN_EXPORT_FIELDS[type].filter((field) => field.default).map((field) => field.key) as AdminExportField<T>[];
}
export function parseAdminExportFields<T extends AdminExportEntityType>(
  type: T,
  value: unknown,
  mediaTypes: readonly string[] = [],
): AdminExportField<T>[] {
  if (!Array.isArray(value) || value.length === 0) throw new Error("Выберите хотя бы одно поле.");
  const allowed = new Set<string>(ADMIN_EXPORT_FIELDS[type].map((field) => field.key));
  if (type === "media_items") {
    for (const field of getAvailableMetadataExportFields(mediaTypes)) {
      allowed.add(getMetadataExportFieldKey(field.key));
    }
  }
  const fields = [...new Set(value.map(String))];
  if (fields.some((field) => !allowed.has(field))) throw new Error("Выбрано неизвестное поле экспорта.");
  return fields as AdminExportField<T>[];
}
