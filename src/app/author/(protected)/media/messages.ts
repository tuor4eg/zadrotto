export function getAuthorMediaFormErrorMessage(error?: string) {
  if (error === "required") {
    return "Заполни название и тип медиа.";
  }

  if (error === "invalid-year") {
    return "Год должен быть числом от 0 до 9999.";
  }

  if (error === "invalid-franchise") {
    return "Выбранная серия не найдена.";
  }

  if (error === "duplicate-code") {
    return "Серия с таким названием уже существует.";
  }

  if (error === "forbidden") {
    return "Создавать серии могут только доверенные авторы.";
  }

  if (error === "invalid-carrier") {
    return "Выбранный носитель не найден.";
  }

  if (error === "carrier-media-type") {
    return "Носитель должен соответствовать выбранному типу медиа.";
  }

  if (error === "cover-type") {
    return "Обложка должна быть JPG, PNG или WebP.";
  }

  if (error === "cover-too-large") {
    return "Обложка должна быть не больше 5 МБ.";
  }

  if (error === "cover-upload") {
    return "Не удалось загрузить обложку. Проверь S3-настройки.";
  }

  if (error === "cover-delete") {
    return "Не удалось удалить обложку из хранилища. Проверь S3-настройки.";
  }

  if (error === "invalid-metadata") {
    return "Не удалось сохранить факты тайтла. Выбери тайтл у провайдера еще раз.";
  }

  if (error === "total-limit") {
    return "Достигнут общий лимит черновиков для твоего профиля.";
  }

  if (error === "daily-limit") {
    return "Достигнут суточный лимит черновиков для твоего профиля.";
  }

  return null;
}
