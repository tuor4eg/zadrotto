import { Alert } from "@/components/ui/alert";
import { Button } from "@/components/ui/button";
import { Input, Label } from "@/components/ui/form";
import { getEmailAutomationSettings } from "@/db/queries/email-automation";
import { saveEmailAutomationSettingsAction } from "./actions";

const FIELDS = [
  ["deliveryBatchSize", "Писем за один запуск", 1, 50],
  ["deliveryMaxAttempts", "Максимум попыток", 1, 20],
  ["retryBaseSeconds", "Базовая задержка повтора, секунд", 60, 86400],
  ["retryMaxSeconds", "Максимальная задержка повтора, секунд", 60, 604800],
  ["challengeRetentionHours", "Хранить challenges, часов", 1, 720],
  ["sessionRetentionDays", "Хранить завершённые сессии, дней", 1, 365],
  ["staleRegistrationDays", "Хранить незавершённые регистрации, дней", 1, 90],
  ["sentOutboxRetentionDays", "Хранить отправленные письма, дней", 1, 365],
  ["failedOutboxRetentionDays", "Хранить ошибочные письма, дней", 7, 730],
] as const;

export default async function EmailGeneralPage({ searchParams }: { searchParams: Promise<{ error?: string; updated?: string }> }) {
  const [settings, query] = await Promise.all([getEmailAutomationSettings(), searchParams]);
  return <section className="space-y-5"><div><h2 className="font-serif text-3xl">Общие настройки</h2><p className="text-sm text-stone-600">Размер очереди, повторы и сроки хранения. Расписание настраивается в разделе фоновых задач.</p></div>
    {query.error ? <Alert variant="destructive">Проверь диапазоны значений. Максимальная задержка повтора не может быть меньше базовой.</Alert> : query.updated ? <Alert>Настройки сохранены.</Alert> : null}
    <form action={saveEmailAutomationSettingsAction} className="grid gap-4 rounded-md border bg-white p-5 sm:grid-cols-2">{FIELDS.map(([name, label, min, max]) => <div key={name} className="grid gap-2"><Label htmlFor={name}>{label}</Label><Input id={name} name={name} type="number" min={min} max={max} defaultValue={settings[name]} required /></div>)}<div className="sm:col-span-2"><Button type="submit">Сохранить</Button></div></form>
  </section>;
}
