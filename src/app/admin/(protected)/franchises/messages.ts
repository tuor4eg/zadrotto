import { getAdminFormErrorMessage } from "@/lib/app-error-messages";

export function formatMediaItemsCount(count: number) {
  const plural = new Intl.PluralRules("ru-RU").select(count);
  const label =
    plural === "one"
      ? "запись"
      : plural === "few"
        ? "записи"
        : "записей";

  return `${count} ${label}`;
}

export function getFranchiseErrorMessage(error?: string) {
  const formErrorMessage = getAdminFormErrorMessage(error);

  if (formErrorMessage) {
    return formErrorMessage;
  }

  if (error === "duplicate-code") {
    return "Серия с таким кодом уже существует.";
  }

  if (error === "required") {
    return "Заполни название.";
  }

  if (error === "not-empty") {
    return "Удалять можно только серии без записей.";
  }

  if (error === "invalid-franchise") {
    return "Не удалось найти серию.";
  }

  if (error === "invalid-media") {
    return "Не удалось найти запись.";
  }

  return null;
}
