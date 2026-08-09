import { Alert } from "@/components/ui/alert";
import { Button } from "@/components/ui/button";
import { Tooltip } from "@/components/ui/tooltip";
import { RotateCcw, X } from "lucide-react";
import { Table, TBody, TD, TH, THead, TR, TableWrap } from "@/components/ui/table";
import { getAdminJobRuns, getAdminJobs } from "@/db/queries/jobs";
import { getRegisteredJobHandlers } from "@/lib/jobs/queue";
import { cancelJobRunAction, retryJobRunAction } from "./actions";
import { JobsManager } from "./jobs-manager";

const statusLabel: Record<string, string> = { queued: "Ожидает", running: "Выполняется", succeeded: "Готово", failed: "Ошибка", cancelled: "Отменён" };

export default async function JobsPage({ searchParams }: { searchParams: Promise<Record<string, string | undefined>> }) {
  const query = await searchParams;
  const [jobs, runs, handlerDefinitions] = await Promise.all([getAdminJobs(), getAdminJobRuns({}), Promise.resolve(getRegisteredJobHandlers())]);
  const handlers = handlerDefinitions.map(({ label, type }) => ({ label, type }));
  return <section className="space-y-8"><div><h2 className="font-serif text-3xl">Фоновые задачи</h2><p className="text-sm text-stone-600">Расписание использует пятичастный cron в UTC. Запуски хранят отдельную историю.</p></div>
    {query.error ? <Alert variant="destructive">Не удалось выполнить действие: проверьте заполненные поля и расписание.</Alert> : null}
    <JobsManager handlers={handlers} jobs={jobs} />
    <div><h3 className="mb-3 font-serif text-2xl">Последние запуски</h3><TableWrap className="overflow-x-auto"><Table><THead><tr><TH>ID / тип</TH><TH>Статус</TH><TH>Время</TH><TH>Попытки</TH><TH>Ошибка</TH><TH /></tr></THead><TBody>{runs.map((run) => <TR key={run.id}><TD>#{run.id}<div className="text-xs text-stone-500">{run.type}{run.retryOfRunId ? ` · повтор #${run.retryOfRunId}` : ""}</div></TD><TD>{statusLabel[run.status] ?? run.status}</TD><TD>{run.scheduledFor.toISOString()}</TD><TD>{run.attempts}/{run.maxAttempts}</TD><TD className="max-w-72 break-words text-xs text-red-700">{run.errorMessage ?? "—"}</TD><TD>{run.status === "failed" ? <form action={retryJobRunAction}><input type="hidden" name="id" value={run.id} /><Tooltip label="Повторить"><Button size="icon" type="submit" variant="outline" aria-label={`Повторить запуск ${run.id}`}><RotateCcw className="size-4" /></Button></Tooltip></form> : run.status === "queued" ? <form action={cancelJobRunAction}><input type="hidden" name="id" value={run.id} /><Tooltip label="Отменить"><Button size="icon" type="submit" variant="outline" aria-label={`Отменить запуск ${run.id}`}><X className="size-4" /></Button></Tooltip></form> : null}</TD></TR>)}</TBody></Table></TableWrap></div>
  </section>;
}
