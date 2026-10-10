import { Badge } from "@/components/ui/badge";
import { COVER_PROVIDER_LABELS } from "@/lib/covers/provider-settings";
import { isCoverProviderCode } from "@/lib/covers/types";
import { decodeBggNumericEntities } from "@/lib/media/metadata-facts";

export function genreProviderName(provider: string, name: string) {
  return provider === "bgg" ? decodeBggNumericEntities(name) : name;
}

export const GENRE_REQUEST_STATUS_LABELS = {
  pending: "Ожидает решения", applying: "Применяется", processed: "Обработана", failed: "Ошибка применения",
} as const;

export function GenreRequestStatus({ status }: { status: keyof typeof GENRE_REQUEST_STATUS_LABELS }) {
  return <Badge variant={status === "failed" ? "destructive" : status === "pending" ? "warning" : "outline"}>
    {GENRE_REQUEST_STATUS_LABELS[status]}
  </Badge>;
}

export function genreProviderLabel(provider: string) {
  return isCoverProviderCode(provider) ? COVER_PROVIDER_LABELS[provider] : provider;
}

export function genreRequestDate(date: Date | string | null) {
  return date ? new Intl.DateTimeFormat("ru-RU", { dateStyle: "medium", timeStyle: "short", timeZone: "Europe/Moscow" }).format(new Date(date)) : "—";
}

export function genreRequestError(code: string | undefined) {
  if (!code) return null;
  if (code === "applying") return "Сначала завершите текущий пересчёт жанров записей.";
  if (code === "already-resolved" || code === "changed") return "Другой администратор уже изменил заявку. Проверьте текущее решение.";
  if (code === "invalid" || code === "invalid-name" || code === "invalid-genres") return "Проверьте название и выбранные жанры.";
  if (code === "not-found") return "Заявка не найдена.";
  if (code === "not-retryable") return "Повтор доступен только после ошибки применения.";
  return "Не удалось сохранить решение. Попробуйте ещё раз.";
}
