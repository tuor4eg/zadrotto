const MESSAGES: Record<string, string> = {
  "tmdb-person-conflict": "У выбранного создателя уже есть другой TMDB person ID. Проверьте, не являются ли эти люди однофамильцами. Для другого человека создайте отдельного создателя.",
  "identity-conflict": "Внешний ID уже связан с другим создателем или конфликтует с существующей привязкой. Проверьте привязки перед сопоставлением.",
  "applying": "Дождитесь завершения текущей задачи применения решения.",
  "already-resolved": "По этой заявке уже принято решение. Обновите список заявок.",
  "not-found": "Заявка больше не найдена. Обновите список заявок.",
  "invalid-type": "Тип выбранного создателя не подходит для этой заявки.",
  "invalid-name": "Укажите имя создателя.",
};
export function getCreatorRequestErrorMessage(code: string) {
  return Object.hasOwn(MESSAGES, code) ? MESSAGES[code] : "Не удалось выполнить действие. Проверьте состояние заявки.";
}
export function isCreatorRequestErrorCode(code: string) { return Object.hasOwn(MESSAGES, code); }
