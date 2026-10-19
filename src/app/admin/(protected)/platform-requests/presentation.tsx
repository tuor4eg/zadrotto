import { Badge } from "@/components/ui/badge";
import { COVER_PROVIDER_LABELS } from "@/lib/covers/provider-settings";
import { isCoverProviderCode } from "@/lib/covers/types";
import { decodeBggNumericEntities } from "@/lib/media/metadata-facts";

export function platformProviderName(provider: string, name: string) {
  return provider === "bgg" ? decodeBggNumericEntities(name) : name;
}

export const PLATFORM_REQUEST_STATUS_LABELS = {
  pending: "Ожидает решения", applying: "Применяется", processed: "Обработана", failed: "Ошибка применения",
} as const;

export function PlatformRequestStatus({ status }: { status: keyof typeof PLATFORM_REQUEST_STATUS_LABELS }) {
  return <Badge variant={status === "failed" ? "destructive" : status === "pending" ? "warning" : "outline"}>
    {PLATFORM_REQUEST_STATUS_LABELS[status]}
  </Badge>;
}

export function platformProviderLabel(provider: string) {
  if(provider === "platform-logos") return "Выбор логотипа";
  return isCoverProviderCode(provider) ? COVER_PROVIDER_LABELS[provider] : provider;
}

export function platformRequestDate(date: Date | string | null) {
  return date ? new Intl.DateTimeFormat("ru-RU", { dateStyle: "medium", timeStyle: "short", timeZone: "Europe/Moscow" }).format(new Date(date)) : "—";
}

export function platformRequestError(code: string | undefined) {
  if (!code) return null;
  if (code === "applying") return "Сначала завершите текущий пересчёт платформ записей.";
  if (code === "already-resolved" || code === "changed") return "Другой администратор уже изменил заявку. Проверьте текущее решение.";
  if (code === "invalid" || code === "invalid-name" || code === "invalid-platforms") return "Проверьте название и выбранные платформы.";
  if (code === "not-found") return "Заявка не найдена.";
  if (code === "not-retryable") return "Повтор доступен только после ошибки применения.";
  return "Не удалось сохранить решение. Попробуйте ещё раз.";
}
