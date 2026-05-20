import { getAdminFormErrorMessage } from "@/lib/app-error-messages";

export function getAuthorErrorMessage(error?: string) {
  const formErrorMessage = getAdminFormErrorMessage(error);

  if (formErrorMessage) {
    return formErrorMessage;
  }

  if (error === "duplicate-code") {
    return "Автор с таким именем уже существует.";
  }

  if (error === "required") {
    return "Заполни имя.";
  }

  if (error === "invalid-author") {
    return "Не удалось найти автора.";
  }

  if (error === "author-has-data") {
    return "Нельзя удалить автора: у него есть права, оценки или добавленные записи.";
  }

  if (error === "system-author") {
    return "Системного автора нельзя заблокировать.";
  }

  if (error === "last-system-author") {
    return "Нельзя удалить последнего системного автора.";
  }

  if (error === "invalid-permission") {
    return "Не удалось сохранить право автора.";
  }

  return null;
}
