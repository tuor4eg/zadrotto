import { getAdminFormErrorMessage } from "@/lib/app-error-messages";

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

  if (error === "invalid-media") {
    return "Не удалось найти запись.";
  }

  if (error === "rated") {
    return "Удалять можно только записи без оценок.";
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

  return null;
}
