import Link from "next/link";
import { Download, RotateCcw, X } from "lucide-react";

import { PaginationNav } from "@/components/pagination-nav";
import { Badge } from "@/components/ui/badge";
import { Button, buttonVariants } from "@/components/ui/button";
import { Table, TBody, TD, TH, THead, TR, TableWrap } from "@/components/ui/table";
import { listAdminExports } from "@/db/queries/admin-exports";
import { getAdminExportLabel } from "@/lib/admin-exports/model";
import { requireAdminUser } from "@/lib/auth/admin-auth";
import { parsePage } from "@/lib/common/pagination";
import { AdminToasts, type AdminToast } from "../admin-toasts";
import { EmptyState, PageHeader } from "../admin-ui";
import { cancelAdminExportAction, createDatabaseDumpAction, retryAdminExportAction } from "./actions";
import { CreateDumpButton } from "./create-dump-button";

const STATUS_LABELS = { queued: "Ожидает", running: "Выполняется", ready: "Готов", failed: "Ошибка", expired: "Истёк" } as const;
type ExportItem = Awaited<ReturnType<typeof listAdminExports>>["items"][number];

function ExportStatus({ item }: { item: ExportItem }) {
  return <>
    <Badge variant={item.status === "ready" ? "positive" : item.status === "failed" ? "destructive" : item.status === "running" ? "warning" : "outline"}>
      {STATUS_LABELS[item.status as keyof typeof STATUS_LABELS] ?? item.status}
    </Badge>
    {item.errorMessage ? <p className="mt-1 max-w-md break-words text-xs text-red-700">{item.errorMessage}</p> : null}
  </>;
}

function ExportResult({ item }: { item: ExportItem }) {
  return <div className="text-sm text-stone-600">
    {item.rowCount === null ? null : <div>{item.rowCount} строк</div>}
    {item.fileSize === null ? "—" : <div>{Math.ceil(item.fileSize / 1024).toLocaleString("ru-RU")} КБ{item.entityType === "database_dump" ? " · SQL.GZ" : " · CSV"}</div>}
    {item.status === "ready" ? <div className="mt-1 text-xs">Хранится до {item.expiresAt.toLocaleDateString("ru-RU", { timeZone: "Europe/Moscow" })}</div> : null}
  </div>;
}

function ExportActions({ item }: { item: ExportItem }) {
  return <div className="flex flex-wrap gap-2 md:justify-end">
    {item.status === "queued" ? <form action={cancelAdminExportAction}>
      <input type="hidden" name="exportId" value={item.id} /><Button size="sm" variant="outline"><X />Отменить</Button>
    </form> : null}
    {item.status === "ready" && item.expiresAt > new Date() ? <Link href={`/admin/exports/${item.id}/download`} prefetch={false} className={buttonVariants({ size: "sm" })}><Download />Скачать</Link> : null}
    {item.status === "failed" ? <form action={retryAdminExportAction}>
      <input type="hidden" name="exportId" value={item.id} /><Button size="sm" variant="outline"><RotateCcw />Повторить</Button>
    </form> : null}
  </div>;
}

function ExportName({ item }: { item: ExportItem }) {
  return <div>
    <div className="font-medium">{getAdminExportLabel(item.entityType)}</div>
    <time className="text-xs text-stone-500" dateTime={item.createdAt.toISOString()}>{item.createdAt.toLocaleString("ru-RU", { timeZone: "Europe/Moscow" })}</time>
  </div>;
}

export default async function AdminExportsPage({ searchParams }: { searchParams: Promise<{ page?: string; created?: string; retried?: string; cancelled?: string; error?: string }> }) {
  const [admin, params] = await Promise.all([requireAdminUser(), searchParams]);
  const result = await listAdminExports({ adminId: admin.id, page: parsePage(params.page) });
  const messages = [
    ...(params.created === "1" ? [{ id: "created", tone: "success" as const, text: "Экспорт поставлен в очередь." }] : []),
    ...(params.retried === "1" ? [{ id: "retried", tone: "success" as const, text: "Экспорт поставлен в очередь повторно." }] : []),
    ...(params.cancelled === "1" ? [{ id: "cancelled", tone: "success" as const, text: "Экспорт отменён." }] : []),
    ...(params.error ? [{ id: "error", tone: "error" as const, text: params.error === "dump-migration" ? "Для создания дампа базы примените миграции: npm run db:migrate." : "Операция с экспортом не выполнена." }] : []),
  ] satisfies AdminToast[];

  return <div className="flex flex-col gap-5">
    <AdminToasts clearParams={["created", "retried", "cancelled", "error"]} messages={messages} />
    <PageHeader title="Экспорты" description="Фоновые CSV-выгрузки записей и серий, полный дамп базы." aside={<div className="flex flex-wrap gap-2">
      <form action="/admin/exports" method="get"><Button variant="outline" type="submit"><RotateCcw />Обновить</Button></form>
      <form action={createDatabaseDumpAction}><CreateDumpButton /></form>
    </div>} />
    <p className="text-sm leading-6 text-stone-500">Дамп содержит всю базу, включая данные аккаунтов. Файл SQL.GZ появится здесь после завершения задачи. Обложки и ключи шифрования сохраняются отдельно.</p>
    {result.items.length === 0 ? <EmptyState>Экспортов пока нет. Создайте дамп базы или запустите CSV-выгрузку со страницы записей или серий.</EmptyState> : <>
      <div className="hidden md:block"><TableWrap><Table><THead><tr><TH>Экспорт</TH><TH>Статус</TH><TH>Результат</TH><TH className="text-right">Действия</TH></tr></THead><TBody>
        {result.items.map((item) => <TR key={item.id}>
          <TD><ExportName item={item} /></TD><TD><ExportStatus item={item} /></TD>
          <TD><ExportResult item={item} /></TD><TD><ExportActions item={item} /></TD>
        </TR>)}
      </TBody></Table></TableWrap></div>
      <div className="flex flex-col gap-3 md:hidden">
        {result.items.map((item) => <article key={item.id} className="min-w-0 rounded-lg border border-stone-200 bg-white p-4">
          <div className="flex flex-wrap items-start justify-between gap-3"><ExportName item={item} /><div><ExportStatus item={item} /></div></div>
          <div className="mt-3"><ExportResult item={item} /></div><div className="mt-3"><ExportActions item={item} /></div>
        </article>)}
      </div>
      <PaginationNav basePath="/admin/exports" page={result.page} pageSize={result.pageSize} searchParams={{}} totalCount={result.totalCount} totalPages={result.totalPages} />
    </>}
  </div>;
}
