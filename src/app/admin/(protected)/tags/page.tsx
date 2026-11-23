import { parseAdminTagStatus } from "@/lib/tags/model";
import { Badge } from "@/components/ui/badge";
import Link from "next/link";
import { buttonVariants } from "@/components/ui/button";
import { Pencil, Trash2 } from "lucide-react";
import { ConfirmAction } from "@/components/ui/confirm-action";
import { AdminToasts } from "../admin-toasts";
import { deleteTagAction } from "./actions";
import { PaginationNav } from "@/components/pagination-nav";
import { Table, TableWrap, TBody, TD, TH, THead, TR } from "@/components/ui/table";
import { getAdminTagsPage } from "@/db/queries/tags";
import { requireAdminUser } from "@/lib/auth/admin-auth";
import { parsePage } from "@/lib/common/pagination";
import { EmptyState, PageHeader } from "../admin-ui";
import { TagSearch } from "./tag-search";

export default async function TagsPage({ searchParams }: {
  searchParams: Promise<{ q?: string; page?: string; error?: string; status?: string }>;
}) {
  await requireAdminUser();
  const query = await searchParams;
  const searchQuery = query.q?.trim() ?? "";
  const status = parseAdminTagStatus(query.status);
  const result = await getAdminTagsPage({ searchQuery, page: parsePage(query.page), status });
  const deleteButton = (tag: typeof result.items[number]) => <ConfirmAction action={deleteTagAction}
    title={`Удалить тег «${tag.title}»?`} description="Тег и все его назначения на записях будут удалены. Это действие нельзя отменить."
    confirmLabel="Удалить тег" triggerLabel="Удалить тег" triggerAriaLabel={tag.isSystem ? "Редакционный тег нельзя удалить" : `Удалить тег ${tag.title}`}
    triggerIcon={<Trash2 />} triggerSize="icon" disabled={tag.isSystem}
    fields={[{ name: "tagId", value: tag.id }, { name: "q", value: searchQuery }, { name: "page", value: result.page }, { name: "status", value: status }]} />;
  const tagStatus = (tag: typeof result.items[number]) => (
    <Badge variant="outline">{tag.isSystem ? "Редакционный" : "Обычный"}</Badge>
  );
  const actions = (tag: typeof result.items[number]) => (
    <div className="flex justify-end gap-2">
      <Link
        href={`/admin/tags/${tag.id}/edit`}
        aria-label={`Редактировать тег «${tag.title}»`}
        title="Редактировать"
        prefetch={false}
        className={buttonVariants({ variant: "outline", size: "icon" })}
      >
        <Pencil aria-hidden />
      </Link>
      {deleteButton(tag)}
    </div>
  );
  const error = query.error === "system" ? "Редакционный тег нельзя удалить." : query.error === "dependencies"
    ? "Тег связан с достижениями, заменами жанров или миграцией. Удаление недоступно." : query.error ? "Не удалось удалить тег." : null;
  return <div className="grid gap-5">
    <PageHeader title="Теги" description="Плоские теги для классификации записей." />
    <AdminToasts clearParams={["error"]} messages={error ? [{ id: "tag-delete", tone: "error", text: error }] : []} />
    <TagSearch searchQuery={searchQuery} status={status} />
    <p className="text-sm text-stone-500">Тегов: {result.total}</p>
    {result.items.length === 0 ? <EmptyState>{searchQuery || status !== "all" ? "Теги не найдены." : "Теги пока не добавлены."}</EmptyState> : <>
      <div className="grid gap-3 md:hidden">
        {result.items.map(tag => <article key={tag.id} className="flex min-w-0 items-center justify-between gap-3 rounded-lg border border-stone-200 bg-white p-4">
          <div className="min-w-0"><div className="break-words font-medium text-stone-950">{tag.title}</div><div className="mt-1">{tagStatus(tag)}</div><div className="mt-1 text-xs text-stone-500">Записей: {tag.mediaItemsCount}</div></div>
          {actions(tag)}
        </article>)}
      </div>
      <TableWrap className="hidden md:block">
        <Table className="table-fixed">
          <THead><tr><TH>Название</TH><TH className="w-40">Статус</TH><TH className="w-28 text-right">Записи</TH><TH className="w-32 text-right">Действия</TH></tr></THead>
          <TBody>{result.items.map(tag => <TR key={tag.id}>
            <TD><div className="break-words font-medium text-stone-950">{tag.title}</div></TD>
            <TD>{tagStatus(tag)}</TD>
            <TD className="text-right tabular-nums">{tag.mediaItemsCount}</TD>
            <TD>{actions(tag)}</TD>
          </TR>)}</TBody>
        </Table>
      </TableWrap>
      <PaginationNav basePath="/admin/tags" itemLabel="тегов" page={result.page} pageSize={result.pageSize}
        searchParams={{ q: searchQuery || undefined, status: status !== "all" ? status : undefined }} totalCount={result.total} totalPages={result.totalPages} />
    </>}
  </div>;
}
