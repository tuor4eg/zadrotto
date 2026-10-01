import Link from "next/link";
import { Download, RotateCcw, X } from "lucide-react";

import { PaginationNav } from "@/components/pagination-nav";
import { Badge } from "@/components/ui/badge";
import { Button, buttonVariants } from "@/components/ui/button";
import { Table, TBody, TD, TH, THead, TR, TableWrap } from "@/components/ui/table";
import { listAdminExports } from "@/db/queries/admin-exports";
import { requireAdminUser } from "@/lib/auth/admin-auth";
import { parsePage } from "@/lib/common/pagination";
import { AdminToasts, type AdminToast } from "../admin-toasts";
import { EmptyState, PageHeader } from "../admin-ui";
import { cancelAdminExportAction, retryAdminExportAction } from "./actions";

const STATUS_LABELS = { queued: "Ожидает", running: "Выполняется", ready: "Готов", failed: "Ошибка", expired: "Истёк" } as const;

export default async function AdminExportsPage({ searchParams }: { searchParams: Promise<{ page?: string; created?: string; retried?: string; cancelled?: string; error?: string }> }) {
  const [admin, params] = await Promise.all([requireAdminUser(), searchParams]);
  const result = await listAdminExports({ adminId: admin.id, page: parsePage(params.page) });
  const messages = [
    ...(params.created === "1" ? [{ id: "created", tone: "success" as const, text: "Экспорт поставлен в очередь." }] : []),
    ...(params.retried === "1" ? [{ id: "retried", tone: "success" as const, text: "Экспорт поставлен в очередь повторно." }] : []),
    ...(params.cancelled === "1" ? [{ id: "cancelled", tone: "success" as const, text: "Экспорт отменён." }] : []),
    ...(params.error ? [{ id: "error", tone: "error" as const, text: "Операция с экспортом не выполнена." }] : []),
  ] satisfies AdminToast[];

  return <div className="flex flex-col gap-5">
    <AdminToasts clearParams={["created", "retried", "cancelled", "error"]} messages={messages} />
    <PageHeader title="Экспорты" description="Фоновые CSV-выгрузки записей и серий." />
    {result.items.length === 0 ? <EmptyState>Экспортов пока нет. Запустите выгрузку со страницы записей или серий.</EmptyState> : <>
      <TableWrap><Table><THead><tr><TH>Экспорт</TH><TH>Статус</TH><TH>Результат</TH><TH className="text-right">Действия</TH></tr></THead><TBody>
        {result.items.map((item) => <TR key={item.id}>
          <TD><div className="font-medium">{item.entityType === "media_items" ? "Записи" : "Серии"}</div><time className="text-xs text-stone-500" dateTime={item.createdAt.toISOString()}>{item.createdAt.toLocaleString("ru-RU")}</time></TD>
          <TD><Badge variant={item.status === "ready" ? "positive" : item.status === "failed" ? "destructive" : item.status === "running" ? "warning" : "outline"}>{STATUS_LABELS[item.status as keyof typeof STATUS_LABELS] ?? item.status}</Badge>{item.errorMessage ? <p className="mt-1 max-w-md text-xs text-red-700">{item.errorMessage}</p> : null}</TD>
          <TD className="text-sm text-stone-600">{item.rowCount === null ? "—" : `${item.rowCount} строк`}{item.fileSize === null ? null : <div className="text-xs">{Math.ceil(item.fileSize / 1024)} КБ</div>}</TD>
          <TD><div className="flex justify-end gap-2">{item.status === "queued" ? <form action={cancelAdminExportAction}><input type="hidden" name="exportId" value={item.id} /><Button size="sm" variant="outline"><X />Отменить</Button></form> : null}{item.status === "ready" && item.expiresAt > new Date() ? <Link href={`/admin/exports/${item.id}/download`} className={buttonVariants({ size: "sm" })}><Download />Скачать</Link> : null}{item.status === "failed" ? <form action={retryAdminExportAction}><input type="hidden" name="exportId" value={item.id} /><Button size="sm" variant="outline"><RotateCcw />Повторить</Button></form> : null}</div></TD>
        </TR>)}
      </TBody></Table></TableWrap>
      <PaginationNav basePath="/admin/exports" page={result.page} pageSize={result.pageSize} searchParams={{}} totalCount={result.totalCount} totalPages={result.totalPages} />
    </>}
  </div>;
}
