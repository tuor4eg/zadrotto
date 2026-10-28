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
  if (run.payload.mediaType === "boardgame" && run.payload.applyBoardgameChanges !== true && ["process", "refresh-process"].includes(run.payload.operation)) {
    return { active, success: true, message: "Проверенный перенос завершён: данные BGG совпали с существующими связями, старые дубли очищены. Жанры и создатели не изменялись." };
  }
  if (run.payload.mediaType === "game" && run.payload.applyGameChanges !== true && (run.payload.operation === "process" || run.payload.operation === "refresh-process")) {
    return { active, success: true, message: "Проверенный перенос завершён: данные совпали с существующими связями, старые дубли очищены. Жанры, платформы и компании не изменялись." };
  }
  const messages = {
    refresh: "Данные провайдера сохранены. Запись этой операцией не изменялась. Теперь сравните данные и примените их к записи.",
    process: "Сохранённые данные обработаны и применены к записи. Ручные назначения и решения модерации сохранены.",
    "refresh-process": "Данные провайдера получены, сохранены и применены к записи. Ручные назначения и решения модерации сохранены.",
    verify: "Проверка завершена без расхождений. Запись этой операцией не изменялась.",
  };
  return { active, success: true, message: messages[run.payload.operation] };
}
