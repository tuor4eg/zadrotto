export const METADATA_ISSUE_LABELS = {
  "no-candidates": "Поиск не дал результатов",
  "title-mismatch": "Название не совпало",
  "year-mismatch": "Год не совпал",
  "ambiguous-match": "Несколько точных совпадений",
  "no-provider-metadata": "Провайдер не вернул метаданные",
  "provider-error": "Ошибка провайдера",
  "unsupported-source": "Источник не поддерживается",
} as const;

export type MetadataIssueCode = keyof typeof METADATA_ISSUE_LABELS;

export function getMetadataIssueLabel(code: string | null) {
  return code && code in METADATA_ISSUE_LABELS
    ? METADATA_ISSUE_LABELS[code as MetadataIssueCode]
    : "Причина неизвестна";
}
