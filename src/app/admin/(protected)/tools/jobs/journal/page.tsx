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
  const jobId = parseJobFilter(query.job, jobs);
  const jobFilter = jobId === undefined ? "all" : String(jobId);
  const pageSize = [25, 50, 100].includes(Number(query.pageSize)) ? Number(query.pageSize) : 25;
  const page = parsePositiveInteger(query.page, 1);
  const result = await getAdminJobRuns({ jobId, page, pageSize });
  const href = (targetPage: number) => buildJobJournalHref({ job: jobFilter, page: targetPage, pageSize });
  const currentHref = href(result.page);

  return (
    <section className="space-y-5">
      <div>
        <h2 className="font-serif text-2xl">Журнал запусков</h2>
        <p className="text-sm text-stone-600">
          По умолчанию видны все запуски. Можно сузить список до расписания или разовых запусков.
        </p>
      </div>
      <JobJournalFilters jobFilter={jobFilter} jobs={jobs} pageSize={pageSize} />
      <p className="text-sm text-stone-500">Всего запусков: {result.totalCount}</p>
      <TableWrap className="overflow-x-auto">
        <Table>
          <THead><tr><TH>ID / тип</TH><TH>Статус</TH><TH>Время</TH><TH>Попытки</TH><TH>Ошибка</TH><TH /></tr></THead>
          <TBody>
            {result.items.map((run) => (
              <TR key={run.id}>
                <TD>#{run.id}<div className="text-xs text-stone-500">{run.type}{run.retryOfRunId ? ` · повтор #${run.retryOfRunId}` : ""}</div></TD>
                <TD>{STATUS_LABELS[run.status] ?? run.status}</TD>
                <TD><ActivityLogTime value={run.scheduledFor.toISOString()} /></TD>
                <TD>{run.attempts}/{run.maxAttempts}</TD>
                <TD className="max-w-72 break-words text-xs text-red-700">{run.errorMessage ?? "—"}</TD>
                <TD>
                  {run.status === "failed" ? (
                    <form action={retryJobRunAction}><input type="hidden" name="id" value={run.id} /><input type="hidden" name="returnTo" value={currentHref} /><Tooltip label="Повторить"><Button size="icon" type="submit" variant="outline" aria-label={`Повторить запуск ${run.id}`}><RotateCcw className="size-4" /></Button></Tooltip></form>
                  ) : run.status === "queued" ? (
                    <form action={cancelJobRunAction}><input type="hidden" name="id" value={run.id} /><input type="hidden" name="returnTo" value={currentHref} /><Tooltip label="Отменить"><Button size="icon" type="submit" variant="outline" aria-label={`Отменить запуск ${run.id}`}><X className="size-4" /></Button></Tooltip></form>
                  ) : null}
                </TD>
              </TR>
            ))}
            {result.items.length === 0 ? <TR><TD colSpan={6} className="text-center text-stone-500">Запусков пока нет.</TD></TR> : null}
          </TBody>
        </Table>
      </TableWrap>
      <div className="flex items-center justify-between gap-3">
        <Link className={buttonVariants({ variant: "outline" })} aria-disabled={result.page <= 1} href={href(Math.max(1, result.page - 1))}>Назад</Link>
        <span className="text-sm">Страница {result.page} из {result.totalPages}</span>
        <Link className={buttonVariants({ variant: "outline" })} aria-disabled={result.page >= result.totalPages} href={href(Math.min(result.totalPages, result.page + 1))}>Вперёд</Link>
      </div>
    </section>
  );
}
