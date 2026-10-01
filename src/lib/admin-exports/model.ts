export const ADMIN_EXPORT_ENTITY_TYPES = ["media_items", "series"] as const;
export type AdminExportEntityType = (typeof ADMIN_EXPORT_ENTITY_TYPES)[number];

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

export type AdminExportField<T extends AdminExportEntityType> = (typeof ADMIN_EXPORT_FIELDS)[T][number]["key"];
export function getDefaultAdminExportFields<T extends AdminExportEntityType>(type: T): AdminExportField<T>[] {
  return ADMIN_EXPORT_FIELDS[type].filter((field) => field.default).map((field) => field.key) as AdminExportField<T>[];
}
export function parseAdminExportFields<T extends AdminExportEntityType>(type: T, value: unknown): AdminExportField<T>[] {
  if (!Array.isArray(value) || value.length === 0) throw new Error("Выберите хотя бы одно поле.");
  const allowed = new Set<string>(ADMIN_EXPORT_FIELDS[type].map((field) => field.key));
  const fields = [...new Set(value.map(String))];
  if (fields.some((field) => !allowed.has(field))) throw new Error("Выбрано неизвестное поле экспорта.");
  return fields as AdminExportField<T>[];
}
