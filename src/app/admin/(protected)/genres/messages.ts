import { getAdminFormErrorMessage } from "@/lib/common/app-error-messages";

export function getGenreErrorMessage(error?: string) {
  if (error === "required") return "Заполни название жанра.";
  if (error === "invalid-genre") return "Не удалось найти жанр.";
  return getAdminFormErrorMessage(error);
}
