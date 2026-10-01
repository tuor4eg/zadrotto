export const AUTOMODERATION_MODES = ["off", "shadow", "enforce"] as const;
export type AutomoderationMode = (typeof AUTOMODERATION_MODES)[number];

export const AUTOMODERATION_DECISIONS = ["AUTO_APPROVE", "NEEDS_REVIEW"] as const;
export type AutomoderationDecision = (typeof AUTOMODERATION_DECISIONS)[number];

export const MEDIA_AUTOMODERATION_POLICY_CODE = "media-item-publication";
export const MEDIA_AUTOMODERATION_POLICY_VERSION = 1;
export const MEDIA_AUTOMODERATION_JOB_TYPE = "moderation.auto-check";

export const AUTOMODERATION_REASON_LABELS: Record<string, string> = {
  check_execution_failed: "ошибка автоматической проверки",
  description_changed: "описание отличается от данных провайдера",
  media_type_mismatch: "тип медиа отличается от данных провайдера",
  new_or_unpublished_franchise: "добавлена новая или неопубликованная серия",
  original_title_changed: "оригинальное название отличается от данных провайдера",
  provider_identity_mismatch: "провайдер вернул другую запись",
  provider_item_not_found: "запись не найдена у провайдера",
  provider_snapshot_missing: "нет снимка данных провайдера",
  provider_source_invalid: "источник провайдера не поддерживается",
  published_duplicate_candidate: "найден возможный опубликованный дубликат",
  record_changed_during_check: "запись изменилась во время проверки",
  release_year_changed: "год отличается от данных провайдера",
  suspicious_text: "обнаружен подозрительный текст",
  title_changed: "название отличается от данных провайдера",
  unverified_cover: "обложка загружена вручную, а не выбрана у провайдера",
  user_aliases_present: "добавлены пользовательские альтернативные названия",
};

export function getAutomoderationReasonLabel(code: string) {
  if (code.startsWith("provider_")) {
    return AUTOMODERATION_REASON_LABELS[code] ?? `ошибка проверки у провайдера (${code.slice("provider_".length)})`;
  }

  return AUTOMODERATION_REASON_LABELS[code] ?? code;
}

export function formatAutomoderationReviewMessage(reasonCodes: readonly string[]) {
  const reasons = reasonCodes.map(getAutomoderationReasonLabel);

  return reasons.length > 0
    ? `Автоодобрение не выполнено: ${reasons.join("; ")}.`
    : "Автоодобрение не выполнено: требуется ручная проверка.";
}

export function isAutomoderationMode(value: unknown): value is AutomoderationMode {
  return typeof value === "string" && AUTOMODERATION_MODES.includes(value as AutomoderationMode);
}
