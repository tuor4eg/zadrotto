import { getAdminFormErrorMessage } from "@/lib/app-error-messages";

export function getAuthorErrorMessage(error?: string) {
  const formErrorMessage = getAdminFormErrorMessage(error);

  if (formErrorMessage) {
    return formErrorMessage;
  }

  if (error === "duplicate-code") {
    return "Автор с таким кодом уже существует.";
  }

  if (error === "required") {
    return "Заполни имя.";
  }

  if (error === "invalid-author") {
    return "Не удалось найти автора.";
  }

  if (error === "invalid-permission") {
    return "Не удалось сохранить право автора.";
  }

  return null;
}
