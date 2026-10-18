import { getAdminFormErrorMessage } from "@/lib/common/app-error-messages";

export function getPlatformErrorMessage(error?: string) {
  if (error === "reopen") return "Не удалось вернуть вариант в заявки. Возможно, соответствие изменено или задача ещё выполняется.";
  if (error === "required") return "Заполни название платформы.";
  if (error === "invalid-platform") return "Не удалось найти платформу.";
  return getAdminFormErrorMessage(error);
}
