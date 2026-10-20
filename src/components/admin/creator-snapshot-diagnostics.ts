const messages: Record<string, string> = {
  "fantlab-profile-not-opened": "Библиография FantLab не открыта (is_opened=0); использованы полные данные профиля с проверенным ID.",
  "pseudonym-skipped": "Даты не назначены: создатель является псевдонимом.",
  "non-person-skipped": "Даты жизни не назначаются коллективам и организациям.",
  "life-dates-conflict": "Дата рождения позже даты смерти. Конфликтующие значения не применены.",
  "invalid-birthday": "Дата рождения в ответе неполная или некорректная.",
  "invalid-deathday": "Дата смерти в ответе неполная или некорректная.",
  "ambiguous-binding": "Найдено несколько активных привязок FantLab. Требуется ручной выбор.",
  "missing-binding": "Нет подтверждённой активной привязки FantLab.",
  "invalid-creator-snapshot": "Снимок автора неполный или некорректный. Получите данные заново.",
};
export function creatorSnapshotDiagnosticMessage(code: string) {
  return messages[code] ?? "Данные пропущены при обработке. Проверьте снимок автора.";
}
