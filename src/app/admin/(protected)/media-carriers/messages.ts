import { getAdminFormErrorMessage } from "@/lib/common/app-error-messages";

export function getMediaCarrierErrorMessage(error?: string) {
  const formErrorMessage = getAdminFormErrorMessage(error);

  if (formErrorMessage) {
    return formErrorMessage;
  }

  if (error === "required") {
    return "Заполни код, название и выбери хотя бы один тип медиа.";
  }

  if (error === "invalid-carrier") {
    return "Не удалось найти носитель.";
  }

  if (error === "duplicate-code") {
    return "Носитель с таким кодом уже существует.";
  }

  if (error === "carrier-has-media") {
    return "Нельзя удалить носитель или убрать используемый тип медиа, пока он выбран у записей.";
  }

  return null;
}
