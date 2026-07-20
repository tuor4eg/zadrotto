import { getAdminFormErrorMessage } from "@/lib/common/app-error-messages";

export function getAuthorAccessProfileErrorMessage(error?: string) {
  if (error === "profile-is-registration-default") {
    return "Нельзя удалить профиль: он выбран для новых авторов. Сначала измените настройку в разделе «Настройки → Авторы».";
  }
  const formErrorMessage = getAdminFormErrorMessage(error);

  if (formErrorMessage) {
    return formErrorMessage;
  }

  if (error === "required") {
    return "Заполни название профиля.";
  }

  if (error === "invalid-limit") {
    return "Лимиты должны быть целыми числами больше нуля или пустыми.";
  }

  if (error === "invalid-profile") {
    return "Не удалось найти профиль.";
  }

  if (error === "duplicate-code") {
    return "Профиль с таким названием уже существует.";
  }

  if (error === "profile-has-authors") {
    return "Нельзя удалить профиль, который назначен хотя бы одному автору.";
  }

  return null;
}
