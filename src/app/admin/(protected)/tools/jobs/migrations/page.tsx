import Link from "next/link";
import { Alert } from "@/components/ui/alert";
import { getLatestJobRunsByTypes } from "@/db/queries/jobs";
import { getMigrationDefinition } from "@/lib/jobs/catalog";
import { getRegisteredJobHandlers } from "@/lib/jobs/queue";
import { ActivityLogTime } from "../../activity/activity-log-time";
import { MigrationForm } from "./migration-form";

const STATUS: Record<string, string> = { queued: "Ожидает", running: "Выполняется", succeeded: "Готово", failed: "Ошибка", cancelled: "Отменён" };

export default async function JobMigrationsPage({ searchParams }: { searchParams: Promise<Record<string, string | undefined>> }) {
  const handlers = getRegisteredJobHandlers().filter(handler => handler.manualPlacement === "migration");
  const [query, latestRuns] = await Promise.all([searchParams, getLatestJobRunsByTypes(handlers.map(handler => handler.type))]);
  const byType = new Map(latestRuns.map(run => [run.type, run]));
  return <section className="space-y-6">
    <div><h3 className="font-serif text-2xl">Миграции</h3><p className="mt-1 text-sm text-stone-600">Исторические переносы данных. Успешный запуск не является подтверждением полного завершения переноса.</p></div>
    {query.error ? <Alert variant="destructive">Не удалось поставить миграцию в очередь. Проверьте параметры переноса.</Alert> : null}
    {!handlers.length ? <p className="rounded-md border bg-white p-5 text-stone-600">Сейчас нет доступных миграций</p> : handlers.map(handler => {
      const latest = byType.get(handler.type);
      return <article key={handler.type} className="space-y-4 rounded-md border bg-white p-5">
        <div><h4 className="font-semibold">{handler.label}</h4><p className="mt-1 text-sm text-stone-600">{getMigrationDefinition(handler.type)?.description}</p></div>
        <div className="flex flex-wrap items-center gap-2 text-sm text-stone-600">Последний запуск: {latest ? <><span>{STATUS[latest.status] ?? latest.status}</span><ActivityLogTime value={latest.scheduledFor.toISOString()} /><Link className="underline" href={`/admin/tools/jobs/journal?type=${encodeURIComponent(handler.type)}`}>Журнал</Link></> : "ещё не запускалась"}</div>
        <MigrationForm type={handler.type} />
      </article>;
    })}
  </section>;
}
