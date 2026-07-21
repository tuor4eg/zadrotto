import { Alert } from "@/components/ui/alert";
import { Button } from "@/components/ui/button";
import { Input, Label } from "@/components/ui/form";
import { getEmailAutomationOverview } from "@/db/queries/email-automation";
import { ActivityLogTime } from "../../activity/activity-log-time";
import { saveEmailAutomationSettingsAction } from "./actions";

const FIELDS = [
  ["deliveryIntervalSeconds", "Интервал доставки, секунд (1–60 минут)", 60, 3600],
  ["deliveryBatchSize", "Писем за один запуск", 1, 50],
  ["deliveryMaxAttempts", "Максимум попыток", 1, 20],
  ["retryBaseSeconds", "Базовая задержка повтора, секунд", 60, 86400],
  ["retryMaxSeconds", "Максимальная задержка повтора, секунд", 60, 604800],
  ["cleanupIntervalSeconds", "Интервал очистки, секунд", 3600, 604800],
  ["challengeRetentionHours", "Хранить challenges, часов", 1, 720],
  ["sessionRetentionDays", "Хранить завершённые сессии, дней", 1, 365],
  ["staleRegistrationDays", "Хранить незавершённые регистрации, дней", 1, 90],
  ["sentOutboxRetentionDays", "Хранить отправленные письма, дней", 1, 365],
  ["failedOutboxRetentionDays", "Хранить ошибочные письма, дней", 7, 730],
] as const;

export default async function EmailGeneralPage({ searchParams }: { searchParams: Promise<{ error?: string; updated?: string }> }) {
  const [{ settings, jobs }, query] = await Promise.all([getEmailAutomationOverview(), searchParams]);
  return <section className="space-y-5"><div><h2 className="font-serif text-3xl">Общие настройки</h2><p className="text-sm text-stone-600">Расписание доставки, повторы и сроки хранения.</p></div>
    {query.error ? <Alert variant="destructive">Проверь диапазоны значений. Максимальная задержка повтора не может быть меньше базовой.</Alert> : query.updated ? <Alert>Настройки сохранены.</Alert> : null}
    <div className="grid gap-3 md:grid-cols-2">{jobs.map((job) => <div key={job.job} className="rounded-md border bg-white p-4 text-sm"><p className="font-medium">{job.job === "delivery" ? "Доставка" : "Очистка"}</p><p>Статус: {job.lastStatus === "success" ? "успешно" : job.lastStatus === "failure" ? "ошибка" : "ещё не запускалась"}</p><p>Последний запуск: {job.lastStartedAt ? <ActivityLogTime value={job.lastStartedAt.toISOString()} /> : "—"}</p><p>Завершён: {job.lastFinishedAt ? <ActivityLogTime value={job.lastFinishedAt.toISOString()} /> : "—"}</p><p>Следующий запуск: <ActivityLogTime value={job.nextRunAt.toISOString()} /></p>{job.lastError ? <p className="mt-1 break-words text-red-700">{job.lastError}</p> : null}</div>)}</div>
    <form action={saveEmailAutomationSettingsAction} className="grid gap-4 rounded-md border bg-white p-5 sm:grid-cols-2">{FIELDS.map(([name, label, min, max]) => <div key={name} className="grid gap-2"><Label htmlFor={name}>{label}</Label><Input id={name} name={name} type="number" min={min} max={max} defaultValue={settings[name]} required /></div>)}<div className="sm:col-span-2"><Button type="submit">Сохранить</Button></div></form>
  </section>;
}
