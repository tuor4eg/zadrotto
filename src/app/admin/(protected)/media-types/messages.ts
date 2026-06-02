import { getAdminFormErrorMessage } from "@/lib/app-error-messages";

export function getMediaTypeErrorMessage(error?: string) {
  const formErrorMessage = getAdminFormErrorMessage(error);

  if (formErrorMessage) {
    return formErrorMessage;
  }

  if (error === "required") {
    return "Заполни название типа.";
  }

  if (error === "invalid-type") {
    return "Не удалось найти тип.";
  }

  if (error === "duplicate-code") {
    return "Тип с таким названием уже существует.";
  }

  if (error === "type-has-media") {
    return "Нельзя удалить тип, пока он выбран у записей или носителей.";
  }

  return null;
}
