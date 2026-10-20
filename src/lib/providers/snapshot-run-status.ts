import type { BookSnapshotRun } from "@/db/queries/provider-snapshot-run";

export function bookSnapshotRunStatus(run: BookSnapshotRun) {
  const active = run.status === "queued" || run.status === "running";
  if (active) return { active, success: false, message: run.status === "queued"
    ? (run.payload.checkpoint?.retryId ? "Получить данные пока не удалось. Ожидаем повторной попытки." : "Задача в очереди. Ожидаем запуска или продолжения обработки.")
    : "Задача выполняется. Результат появится здесь автоматически." };
  if (run.status === "cancelled") return { active, success: false, message: "Задача отменена. Если часть ответов успела сохраниться, они показаны ниже." };
  const checkpoint = run.payload.checkpoint;
  if (run.status !== "succeeded" || !checkpoint || checkpoint.failed > 0 || checkpoint.processed !== 1) {
    return { active, success: false, message: "Операция не завершилась успешно. Проверьте ошибку и сохранённые данные ниже." };
  }
  const messages = {
    refresh: "Данные провайдера сохранены. Запись этой операцией не изменялась. Теперь сравните данные и примените их к записи.",
    process: "Сохранённые данные обработаны и применены к записи. Ручные назначения и решения модерации сохранены.",
    "refresh-process": "Данные провайдера получены, сохранены и применены к записи. Ручные назначения и решения модерации сохранены.",
    verify: "Проверка завершена без расхождений. Запись этой операцией не изменялась.",
  };
  return { active, success: true, message: messages[run.payload.operation] };
}
