import { Eye } from "lucide-react";
import Link from "next/link";

import { PaginationNav } from "@/components/pagination-nav";
import { Badge } from "@/components/ui/badge";
import { buttonVariants } from "@/components/ui/button";
import { Table, TBody, TD, TH, THead, TR, TableWrap } from "@/components/ui/table";
import { Tooltip } from "@/components/ui/tooltip";
import { listAdminBugReports } from "@/db/queries/bug-reports";
import {
  BUG_REPORT_STATUSES,
  isBugReportStatus,
  type BugReportStatus,
} from "@/lib/bug-reports/model";
import { EmptyState, PageHeader } from "../admin-ui";

const PAGE_SIZE = 25;

const STATUS_LABELS: Record<BugReportStatus, string> = {
  new: "Новый",
  reviewing: "На проверке",
  confirmed: "Подтверждён",
  fixed: "Исправлен",
  rejected: "Не подтверждён",
};

const STATUS_VARIANTS: Record<BugReportStatus, "default" | "outline" | "positive" | "warning" | "destructive"> = {
  new: "warning",
  reviewing: "default",
  confirmed: "positive",
  fixed: "outline",
  rejected: "destructive",
};

function formatDate(value: Date) {
  return new Intl.DateTimeFormat("ru-RU", {
    dateStyle: "medium",
    timeStyle: "short",
    timeZone: "Europe/Moscow",
  }).format(value);
}

export default async function AdminBugReportsPage({
  searchParams,
}: {
  searchParams: Promise<{ page?: string; status?: string }>;
}) {
  const params = await searchParams;
  const requestedPage = Number(params.page);
  const page = Number.isInteger(requestedPage) && requestedPage > 0 ? requestedPage : 1;
  const status = params.status && isBugReportStatus(params.status) ? params.status : null;
  const result = await listAdminBugReports({ page, pageSize: PAGE_SIZE, status });

  return (
    <div className="flex flex-col gap-5">
      <PageHeader title="Багрепорты" description="Сообщения авторов об ошибках на сайте." />

      <form className="flex flex-wrap items-end gap-3" method="get">
        <label className="grid gap-1 text-sm">
          <span className="font-medium">Статус</span>
          <select name="status" defaultValue={status ?? ""} className="h-10 rounded-md border border-stone-300 bg-white px-3">
            <option value="">Все</option>
            {BUG_REPORT_STATUSES.map((value) => <option key={value} value={value}>{STATUS_LABELS[value]}</option>)}
          </select>
        </label>
        <button className={buttonVariants({ variant: "outline" })} type="submit">Применить</button>
      </form>

      {result.items.length === 0 ? (
        <EmptyState>Багрепортов с таким статусом нет.</EmptyState>
      ) : (
        <>
          <div className="grid gap-3 sm:hidden">
            {result.items.map((report) => (
              <article
                key={report.id}
                className="min-w-0 rounded-lg border border-stone-200 bg-white p-4 shadow-sm"
              >
                <div className="flex items-start justify-between gap-3">
                  <Badge variant={STATUS_VARIANTS[report.status as BugReportStatus]}>
                    {STATUS_LABELS[report.status as BugReportStatus]}
                  </Badge>
                  <time className="shrink-0 text-right text-xs tabular-nums text-stone-500">
                    {formatDate(report.createdAt)}
                  </time>
                </div>

                <p className="mt-3 break-words text-sm leading-6 text-stone-800">
                  {report.description}
                </p>

                <div className="mt-3 grid gap-3 border-t border-stone-100 pt-3">
                  <div className="flex items-end justify-between gap-3">
                    <div className="min-w-0">
                      <div className="mb-1 text-xs font-medium uppercase tracking-[0.12em] text-stone-500">
                        Автор
                      </div>
                      <Link
                        className="block truncate font-medium text-stone-700 underline underline-offset-2"
                        href={`/admin/authors/${report.authorId}`}
                      >
                        {report.authorName}
                      </Link>
                    </div>
                    <Tooltip label="Открыть">
                      <Link
                        href={`/admin/bug-reports/${report.id}`}
                        aria-label={`Открыть багрепорт #${report.id}`}
                        className={buttonVariants({ size: "icon", variant: "outline" })}
                      >
                        <Eye />
                      </Link>
                    </Tooltip>
                  </div>
                  <p className="break-all text-xs text-stone-500">
                    {report.entityType && report.entityId
                      ? `${report.entityType} #${report.entityId}`
                      : "Только URL"}
                  </p>
                </div>
              </article>
            ))}
          </div>

          <TableWrap className="hidden sm:block">
          <Table>
            <THead><tr><TH>Статус</TH><TH>Описание</TH><TH>Автор</TH><TH>Контекст</TH><TH>Дата</TH><TH className="text-right">Действие</TH></tr></THead>
            <TBody>
              {result.items.map((report) => (
                <TR key={report.id}>
                  <TD><Badge variant={STATUS_VARIANTS[report.status as BugReportStatus]}>{STATUS_LABELS[report.status as BugReportStatus]}</Badge></TD>
                  <TD className="max-w-sm"><p className="line-clamp-2 leading-5">{report.description}</p></TD>
                  <TD><Link className="underline underline-offset-2" href={`/admin/authors/${report.authorId}`}>{report.authorName}</Link></TD>
                  <TD className="text-xs text-stone-500">{report.entityType && report.entityId ? `${report.entityType} #${report.entityId}` : "Только URL"}</TD>
                  <TD className="whitespace-nowrap text-xs text-stone-500">{formatDate(report.createdAt)}</TD>
                  <TD className="text-right"><Link href={`/admin/bug-reports/${report.id}`} aria-label={`Открыть багрепорт #${report.id}`} className={buttonVariants({ size: "icon", variant: "outline" })}><Eye /></Link></TD>
                </TR>
              ))}
            </TBody>
          </Table>
          </TableWrap>
        </>
      )}

      <PaginationNav
        basePath="/admin/bug-reports"
        itemLabel="багрепортов"
        page={result.page}
        pageSize={PAGE_SIZE}
        searchParams={{ status: status ?? undefined }}
        totalCount={result.totalCount}
        totalPages={result.totalPages}
        variant="admin"
      />
    </div>
  );
}
