import { getCreatorTypes, getCreatorRoles } from "@/db/queries/creators";
import Link from "next/link";
import { getCurrentJobRuns } from "@/db/queries/current-jobs";
import { getRegisteredJobHandlers } from "@/lib/jobs/queue";
import { parsePage } from "@/lib/common/pagination";
import { getJobProgress } from "@/lib/jobs/progress";
import { StopSnapshotRunButton } from "@/components/admin/stop-snapshot-run-button";
import { buttonVariants } from "@/components/ui/button";
import { Table, TBody, TD, TH, THead, TR } from "@/components/ui/table";
import { ActivityLogTime } from "../../activity/activity-log-time";
import { CurrentJobsAutoRefresh } from "./auto-refresh";
import { CurrentJobProgress } from "./job-progress";

const SOURCE_LABELS: Record<string, string> = { manual: "Ручной запуск", schedule: "По расписанию", event: "Автоматический запуск" };
function duration(start: Date, now: Date) {
  const seconds = Math.max(0, Math.floor((now.getTime() - start.getTime()) / 1000));
  return seconds < 60 ? `${seconds} сек.` : seconds < 3600 ? `${Math.floor(seconds / 60)} мин. ${seconds % 60} сек.` : `${Math.floor(seconds / 3600)} ч. ${Math.floor(seconds % 3600 / 60)} мин.`;
}
export default async function CurrentJobsPage({ searchParams }: { searchParams: Promise<Record<string, string | undefined>> }) {
  const query = await searchParams;
  const [result, creatorTypes, creatorRoles] = await Promise.all([getCurrentJobRuns({ page: parsePage(query.page) }), getCreatorTypes(), getCreatorRoles()]);
  const typeNames = new Map(creatorTypes.map(type => [type.id, type.name]));
  const roleNames = new Map(creatorRoles.map(role => [role.id, role.name]));
  const labels = new Map(getRegisteredJobHandlers().map(handler => [handler.type, handler.label]));
  const now = new Date();
  const currentHref = `/admin/tools/jobs/current?page=${result.page}`;
  const rows = result.items.map(run => {
    const expired = run.status === "running" && run.lockExpiresAt !== null && run.lockExpiresAt <= now;
    const deferred = run.status === "queued" && run.availableAt > now;
    const filters = run.type === "media.creator-images-backfill" ? `Тип: ${typeof run.payload.creatorTypeId === "number" ? typeNames.get(run.payload.creatorTypeId) ?? "Удалённый тип" : "Все"} · Роль: ${typeof run.payload.roleId === "number" ? roleNames.get(run.payload.roleId) ?? "Удалённая роль" : "Все"}` : null;
    return { ...run, filters, title: labels.get(run.type) ?? run.type, progress: getJobProgress(run.type, run.payload),
      statusLabel: expired ? "Ожидает восстановления" : run.status === "running" ? "Выполняется" : deferred ? "Ожидает времени запуска" : "В очереди" };
  });
  const info = (run: typeof rows[number]) => <div className="space-y-1"><p className="font-medium">{run.title}</p>{run.filters ? <p className="text-xs text-stone-600">{run.filters}</p> : null}<p className="break-words text-xs text-stone-500">#{run.id} · {run.type}</p><p className="text-xs">{run.jobId ? <>Расписание: <Link className="underline" href="/admin/tools/jobs/schedules">{run.jobCode ?? `#${run.jobId}`}</Link> · </> : "Разовая задача · "}{SOURCE_LABELS[run.source] ?? run.source}</p></div>;
  const state = (run: typeof rows[number]) => <div className="space-y-1"><p className={run.status === "running" ? "font-medium text-amber-700" : "text-stone-600"}>{run.statusLabel}</p><p className="text-xs text-stone-500">Попытки: {run.attempts}/{run.maxAttempts}</p>{run.errorMessage ? <p className="max-w-80 break-words text-xs text-stone-500">{run.errorMessage}</p> : null}</div>;
  const time = (run: typeof rows[number]) => <div className="space-y-1 text-xs text-stone-500"><p>Создана: <ActivityLogTime value={run.createdAt.toISOString()} /></p>{run.status === "running" && run.startedAt ? <p>Выполняется: {duration(run.startedAt, now)}</p> : <p>С момента создания: {duration(run.createdAt, now)}</p>}{run.status === "queued" && run.availableAt > now ? <p>Запуск: <ActivityLogTime value={run.availableAt.toISOString()} /></p> : null}<p>Состояние обновлено: <ActivityLogTime value={run.updatedAt.toISOString()} /></p></div>;
  const actions = (run: typeof rows[number]) => <div className="space-y-2"><StopSnapshotRunButton runId={run.id} returnTo={currentHref} /><Link className="text-xs underline" href={`/admin/tools/jobs/journal?job=${run.jobId ?? "adhoc"}#run-${run.id}`}>В журнал</Link></div>;
  return <section className="space-y-5">
    <div><h2 className="font-serif text-2xl">Текущие задачи</h2><p className="mt-1 text-sm text-stone-600">Все выполняющиеся и ожидающие запуски. Остановка сохраняет уже сделанное и не отключает расписание.</p><p className="mt-1 text-xs text-stone-500">Текущая операция может успеть завершиться до остановки. Созданные ею отдельные задачи останавливаются по отдельности.</p></div>
    <CurrentJobsAutoRefresh />
    <div className="flex flex-wrap gap-3 text-sm"><span>Выполняется: <strong>{result.running}</strong></span><span>Ожидает: <strong>{result.queued}</strong></span><span>Всего: <strong>{result.totalCount}</strong></span></div>
    {rows.length === 0 ? <div className="rounded-md border border-dashed p-8 text-center text-sm text-stone-500">Сейчас нет выполняющихся или ожидающих задач.</div> : <>
      <div className="hidden rounded-md border border-stone-200 xl:block"><Table><THead><tr><TH>Задача</TH><TH>Статус</TH><TH>Прогресс</TH><TH>Время</TH><TH>Действия</TH></tr></THead><TBody>{rows.map(run => <TR key={run.id}><TD>{info(run)}</TD><TD>{state(run)}</TD><TD><CurrentJobProgress progress={run.progress} running={run.status === "running"} /></TD><TD>{time(run)}</TD><TD>{actions(run)}</TD></TR>)}</TBody></Table></div>
      <div className="grid gap-3 xl:hidden">{rows.map(run => <article key={run.id} className="space-y-4 rounded-md border border-stone-200 p-4">{info(run)}{state(run)}<CurrentJobProgress progress={run.progress} running={run.status === "running"} />{time(run)}{actions(run)}</article>)}</div>
    </>}
    {result.totalPages > 1 ? <nav aria-label="Страницы текущих задач" className="flex items-center justify-between gap-3">{result.page > 1 ? <Link className={buttonVariants({ variant: "outline" })} href={`/admin/tools/jobs/current?page=${result.page - 1}`}>Назад</Link> : <span />}<span className="text-sm">{result.page} / {result.totalPages}</span>{result.page < result.totalPages ? <Link className={buttonVariants({ variant: "outline" })} href={`/admin/tools/jobs/current?page=${result.page + 1}`}>Вперёд</Link> : <span />}</nav> : null}
  </section>;
}
