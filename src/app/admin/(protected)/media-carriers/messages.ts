import { getAdminFormErrorMessage } from "@/lib/app-error-messages";

export function getMediaCarrierErrorMessage(error?: string) {
  const formErrorMessage = getAdminFormErrorMessage(error);

  if (formErrorMessage) {
    return formErrorMessage;
  }

  if (error === "required") {
    return "Заполни название и тип медиа.";
  }

  if (error === "invalid-carrier") {
    return "Не удалось найти носитель.";
  }

  if (error === "duplicate-code") {
    return "Носитель с таким названием уже существует.";
  }

  if (error === "carrier-has-media") {
    return "Нельзя удалить носитель или сменить его тип, пока он выбран у записей.";
  }

  return null;
}
