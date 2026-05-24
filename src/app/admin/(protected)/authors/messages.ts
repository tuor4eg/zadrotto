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
    return "Заполни имя и профиль доступа.";
  }

  if (error === "invalid-author") {
    return "Не удалось найти автора.";
  }

  if (error === "author-has-data") {
    return "Нельзя удалить автора: у него есть оценки или добавленные записи.";
  }

  if (error === "system-author") {
    return "Системного автора нельзя заблокировать.";
  }

  if (error === "last-system-author") {
    return "Нельзя удалить последнего системного автора.";
  }

  if (error === "invalid-profile") {
    return "Не удалось сохранить профиль доступа автора.";
  }

  return null;
}
