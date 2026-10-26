import { getRegisteredJobHandlers } from "@/lib/jobs/queue";
import { getRetiredJob } from "@/lib/jobs/retired";
import { StopSnapshotRunButton } from "@/components/admin/stop-snapshot-run-button";
import { ResumeSnapshotRunButton } from "@/components/admin/resume-snapshot-run-button";
import { RotateCcw, X } from "lucide-react";
import Link from "next/link";

import { ActivityLogTime } from "../../activity/activity-log-time";
import { cancelJobRunAction, retryJobRunAction } from "../actions";
import { Button, buttonVariants } from "@/components/ui/button";
import { Table, TBody, TD, TH, THead, TR, TableWrap } from "@/components/ui/table";
import { Tooltip } from "@/components/ui/tooltip";
import { getAdminJobRuns, getAdminJobs } from "@/db/queries/jobs";
import { buildJobJournalHref } from "./href";
import { JobJournalFilters } from "./job-journal-filters";

const STATUS_LABELS: Record<string, string> = {
  cancelled: "Отменён",
  failed: "Ошибка",
  queued: "Ожидает",
  running: "Выполняется",
  succeeded: "Готово",
};

function parsePositiveInteger(value: string | undefined, fallback: number) {
  const parsed = Number(value);
  return Number.isInteger(parsed) && parsed > 0 ? parsed : fallback;
}

function parseJobFilter(value: string | undefined, jobs: Array<{ id: number }>) {
  if (!value || value === "all") return undefined;
  if (value === "adhoc") return "adhoc" as const;
  const parsed = parsePositiveInteger(value, 0);
  return jobs.some((job) => job.id === parsed) ? parsed : undefined;
}

export default async function JobJournalPage({
  searchParams,
}: {
  searchParams: Promise<Record<string, string | undefined>>;
}) {
  const query = await searchParams;
  const jobs = await getAdminJobs();
  const type = query.type && (getRetiredJob(query.type) || getRegisteredJobHandlers().some(handler => handler.type === query.type)) ? query.type : undefined;
  const jobId = parseJobFilter(query.job, jobs);
  const jobFilter = jobId === undefined ? "all" : String(jobId);
  const pageSize = [25, 50, 100].includes(Number(query.pageSize)) ? Number(query.pageSize) : 25;
  const page = parsePositiveInteger(query.page, 1);
  const result = await getAdminJobRuns({ jobId, page, pageSize, type });
  const href = (targetPage: number) => buildJobJournalHref({ job: jobFilter, page: targetPage, pageSize, type });
  const currentHref = href(result.page);

  const actions = (run: typeof result.items[number]) => (
    getRetiredJob(run.type) ? <span className="text-xs text-stone-500">Снята с эксплуатации</span> : run.type === "reputation.initialize" && run.status === "failed" ? <Link className="text-xs underline" href="/admin/reputation">Открыть репутацию</Link> : run.status === "failed" ? (
      <form action={retryJobRunAction}><input type="hidden" name="id" value={run.id} /><input type="hidden" name="returnTo" value={currentHref} /><Tooltip label="Повторить"><Button size="icon" type="submit" variant="outline" aria-label={`Повторить запуск ${run.id}`}><RotateCcw className="size-4" /></Button></Tooltip></form>
    ) : run.status === "running" ? (
      <StopSnapshotRunButton runId={run.id} returnTo={currentHref} />
    ) : run.status === "queued" ? (
      <div className="flex flex-wrap items-center gap-2">
        {run.type === "provider.snapshots" ? <ResumeSnapshotRunButton runId={run.id} returnTo={currentHref} /> : null}
        <form action={cancelJobRunAction}><input type="hidden" name="id" value={run.id} /><input type="hidden" name="returnTo" value={currentHref} /><Tooltip label="Отменить"><Button size="icon" type="submit" variant="outline" aria-label={`Отменить запуск ${run.id}`}><X className="size-4" /></Button></Tooltip></form>
      </div>
    ) : null
  );

  return (
    <section className="space-y-5">
      <div>
        <h2 className="font-serif text-2xl">Журнал запусков</h2>
        <p className="text-sm text-stone-600">
          Активные запуски показаны первыми. Можно сузить список до выбранного расписания или запусков без расписания.
        </p>
      </div>
      {query.error === "job-type-retired" ? <p role="alert" className="text-sm text-red-700">Этот тип задачи снят с эксплуатации. Используйте актуальную операцию.</p> : null}
      {query.error === "automoderation-terminal" ? (
        <p role="alert" className="text-sm text-red-700">
          Проверка автомодерации уже завершена. Повтор задания не переоткрывает её решение; запись можно проверить вручную.
        </p>
      ) : null}
      <JobJournalFilters type={type} jobFilter={jobFilter} jobs={jobs} pageSize={pageSize} />
      {type ? <p className="text-sm text-stone-500">Тип задачи: {type}</p> : null}
      <p className="text-sm text-stone-500">Всего запусков: {result.totalCount}</p>
      <div className="grid min-w-0 gap-3 xl:hidden">
        {result.items.map(run => <article key={run.id} id={`mobile-run-${run.id}`} className="grid min-w-0 gap-3 rounded-md border border-stone-200 bg-white p-4">
          <div><p className="font-medium">#{run.id} · {STATUS_LABELS[run.status] ?? run.status}</p><p className="mt-1 text-xs text-stone-500">{getRetiredJob(run.type)?.label ?? run.type}{run.retryOfRunId ? ` · повтор #${run.retryOfRunId}` : ""}</p></div>
          <dl className="grid grid-cols-2 gap-3 text-sm">
            <div className="col-span-2"><dt className="text-stone-500">Время</dt><dd><ActivityLogTime value={run.scheduledFor.toISOString()} /></dd></div>
            <div><dt className="text-stone-500">Попытки</dt><dd>{run.attempts}/{run.maxAttempts}</dd></div>
            {run.errorMessage ? <div className="col-span-2"><dt className="text-stone-500">Ошибка</dt><dd className="text-xs text-red-700">{run.errorMessage}</dd></div> : null}
          </dl>
          <div className="flex flex-wrap items-center gap-2">{actions(run)}</div>
        </article>)}
        {result.items.length === 0 ? <p className="text-sm text-stone-500">Запусков пока нет.</p> : null}
      </div>
      <TableWrap className="hidden overflow-x-auto xl:block">
        <Table>
          <THead><tr><TH>ID / тип</TH><TH>Статус</TH><TH>Время</TH><TH>Попытки</TH><TH>Ошибка</TH><TH /></tr></THead>
          <TBody>
            {result.items.map((run) => (
              <TR key={run.id} id={`run-${run.id}`}>
                <TD>#{run.id}<div className="text-xs text-stone-500">{getRetiredJob(run.type)?.label ?? run.type}{run.retryOfRunId ? ` · повтор #${run.retryOfRunId}` : ""}</div></TD>
                <TD>{STATUS_LABELS[run.status] ?? run.status}</TD>
                <TD><ActivityLogTime value={run.scheduledFor.toISOString()} /></TD>
                <TD>{run.attempts}/{run.maxAttempts}</TD>
                <TD className="max-w-72 break-words text-xs text-red-700">{run.errorMessage ?? "—"}</TD>
                <TD>
                  {actions(run)}
                </TD>
              </TR>
            ))}
            {result.items.length === 0 ? <TR><TD colSpan={6} className="text-center text-stone-500">Запусков пока нет.</TD></TR> : null}
          </TBody>
        </Table>
      </TableWrap>
      <div className="flex flex-wrap items-center justify-between gap-3">
        <Link className={buttonVariants({ variant: "outline" })} aria-disabled={result.page <= 1} href={href(Math.max(1, result.page - 1))}>Назад</Link>
        <span className="text-sm">Страница {result.page} из {result.totalPages}</span>
        <Link className={buttonVariants({ variant: "outline" })} aria-disabled={result.page >= result.totalPages} href={href(Math.min(result.totalPages, result.page + 1))}>Вперёд</Link>
      </div>
    </section>
  );
}
