import { getAdminFormErrorMessage } from "@/lib/common/app-error-messages";

export function getAdminMediaErrorMessage(error?: string) {
  const formErrorMessage = getAdminFormErrorMessage(error);

  if (formErrorMessage) {
    return formErrorMessage;
  }

  if (error === "required") {
    return "Заполни название и тип медиа.";
  }

  if (error === "invalid-year") {
    return "Год должен быть числом от 0 до 9999.";
  }

  if (error === "invalid-franchise") {
    return "Выбранная серия не найдена.";
  }

  if (error === "invalid-carrier") {
    return "Выбранный носитель не найден.";
  }

  if (error === "carrier-media-type") {
    return "Носитель должен соответствовать выбранному типу медиа.";
  }

  if (error === "invalid-author") {
    return "Выбранный автор не найден.";
  }

  if (error === "author-required") {
    return "Укажи автора записи.";
  }

  if (error === "duplicate-media-exact") {
    return "Такая запись уже есть в архиве. Открой существующую вместо создания дубля.";
  }

  if (error === "duplicate-media-possible") {
    return "Подтверди, что похожая запись не является дублем.";
  }

  if (error === "invalid-media") {
    return "Не удалось найти запись.";
  }

  if (error === "published-delete") {
    return "Опубликованную запись сначала нужно снять с публикации.";
  }

  if (error === "cover-type") {
    return "Обложка должна быть JPG, PNG или WebP.";
  }

  if (error === "cover-too-large") {
    return "Обложка должна быть не больше 5 МБ.";
  }

  if (error === "cover-upload") {
    return "Не удалось загрузить обложку.";
  }

  if (error === "cover-delete") {
    return "Не удалось удалить обложку.";
  }

  if (error === "invalid-metadata") {
    return "Не удалось сохранить факты тайтла. Выбери тайтл у провайдера еще раз.";
  }

  return null;
}
