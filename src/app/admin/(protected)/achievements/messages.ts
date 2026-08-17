export const ACHIEVEMENT_ERROR_MESSAGES: Record<string, string> = {
  awarded: "Нельзя удалить ачивку, которую уже кто-то получил.",
  "image-invalid": "Нужен корректный JPG, PNG или WebP.",
  "image-too-large": "Изображение должно быть не больше 5 МБ.",
  "image-upload": "Не удалось загрузить изображение в хранилище.",
  invalid: "Проверь заполнение полей.",
  "level-last": "Нельзя удалить единственный уровень.",
  "level-locked": "Выданный уровень не может быть удалён или с повышенным порогом.",
  missing: "Ачивка не найдена.",
  save: "Не удалось сохранить изменения.",
}

export function getAchievementErrorMessage(error?: string) {
  if (!error) return null
  return ACHIEVEMENT_ERROR_MESSAGES[error] ?? "Не удалось сохранить."
}
