import Link from "next/link";
import { notFound } from "next/navigation";
import { ArrowLeft, Pin, PinOff, Save } from "lucide-react";

import { PaginationNav } from "@/components/pagination-nav";
import { Badge } from "@/components/ui/badge";
import { Button, buttonVariants } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Input, Label } from "@/components/ui/form";
import { Table, TableWrap, TBody, TD, TH, THead, TR } from "@/components/ui/table";
import { getMediaTypeOptions } from "@/db/queries/media-types";
import { getAdminTagById, getAdminTagEntriesPage } from "@/db/queries/tags";
import { requireAdminUser } from "@/lib/auth/admin-auth";
import { parsePage } from "@/lib/common/pagination";
import { getMediaTypeLabel } from "@/lib/media/types";

import { AdminToasts } from "../../../admin-toasts";
import { EmptyState, PageHeader } from "../../../admin-ui";
import { renameTagAction, toggleTagForEntryAction } from "../../actions";
import { AttachTagPicker } from "./attach-tag-picker";

const outcomes = {
  renamed: { tone: "success", text: "Название тега сохранено." },
  updated: { tone: "success", text: "Статус назначения обновлён." },
  duplicate: { tone: "error", text: "Тег с таким названием уже существует." },
  invalid: { tone: "error", text: "Введите название тега длиной до 80 символов." },
  error: { tone: "error", text: "Не удалось изменить тег. Обновите страницу и повторите попытку." },
} as const;

export default async function EditTagPage({ params, searchParams }: {
  params: Promise<{ id: string }>;
  searchParams: Promise<{ page?: string; result?: string }>;
}) {
  await requireAdminUser();
  const [{ id }, query] = await Promise.all([params, searchParams]);
  const tagId = Number(id);
  if (!Number.isInteger(tagId) || tagId < 1 || tagId > 2147483647) notFound();

  const [tag, entries, mediaTypes] = await Promise.all([
    getAdminTagById(tagId),
    getAdminTagEntriesPage(tagId, parsePage(query.page)),
    getMediaTypeOptions(),
  ]);
  if (!tag) notFound();
  const result = query.result;
  const notice = result && Object.hasOwn(outcomes, result) ? outcomes[result as keyof typeof outcomes] : null;
  const toggle = toggleTagForEntryAction.bind(null, tagId, entries.page);
  const editHref = `/admin/tags/${tag.id}/edit`;

  function entryLabel(entry: typeof entries.items[number]) {
    return (
      <div className="min-w-0">
        <Link className="break-words font-medium underline underline-offset-2" href={`/admin/media/${entry.id}/edit?tab=tags`}>
          {entry.title}
        </Link>
        <p className="mt-1 text-xs text-stone-500">
          {getMediaTypeLabel(entry.mediaType, mediaTypes)}{entry.releaseYear ? ` · ${entry.releaseYear}` : ""}
        </p>
      </div>
    );
  }

  function editorialAction(entry: typeof entries.items[number]) {
    const label = entry.editorial ? "Открепить" : "Закрепить";
    return (
      <form action={toggle} className="shrink-0">
        <input type="hidden" name="mediaItemId" value={entry.id} />
        <input type="hidden" name="operation" value={entry.editorial ? "unpin" : "pin"} />
        <Button type="submit" variant="outline" size="icon" title={label} aria-label={`${label} тег у записи «${entry.title}»`}>
          {entry.editorial ? <PinOff aria-hidden /> : <Pin aria-hidden />}
        </Button>
      </form>
    );
  }

  return (
    <div className="grid gap-5">
      <PageHeader title={tag.title} description="Редактирование тега" aside={
        <Link href="/admin/tags" className={buttonVariants({ variant: "outline" })}><ArrowLeft />К списку тегов</Link>
      } />
      <AdminToasts clearParams={["result"]} messages={notice ? [{ id: `tag-${result}`, ...notice }] : []} />
      <Card>
        <CardContent className="grid gap-5 pt-5 md:grid-cols-2 md:items-start">
          <form action={renameTagAction.bind(null, tagId, entries.page)} className="grid min-w-0 gap-2">
            <Label htmlFor="tag-title">Название тега</Label>
            <Input id="tag-title" name="title" defaultValue={tag.title} maxLength={80} required />
            <Button type="submit" className="mt-2 justify-self-start"><Save />Сохранить название</Button>
          </form>
          <AttachTagPicker key={tagId} tagId={tagId} taggedEntryCount={entries.total} />
        </CardContent>
      </Card>
      <Card>
        <CardHeader className="flex flex-row items-center justify-between">
          <CardTitle>Записи с тегом</CardTitle>
          <Badge variant="outline">{entries.total}</Badge>
        </CardHeader>
        <CardContent className="grid gap-4">
          {entries.items.length ? (
            <>
              <TableWrap className="hidden md:block">
                <Table>
                  <THead><TR><TH>Запись</TH><TH>Назначения</TH><TH>Статус</TH><TH className="w-px">Действия</TH></TR></THead>
                  <TBody>{entries.items.map((entry) => (
                    <TR key={entry.id}>
                      <TD>{entryLabel(entry)}</TD>
                      <TD className="tabular-nums">{entry.count}</TD>
                      <TD><Badge variant="outline">{entry.editorial ? "Редакционный" : "Обычный"}</Badge></TD>
                      <TD>{editorialAction(entry)}</TD>
                    </TR>
                  ))}</TBody>
                </Table>
              </TableWrap>
              <ul className="grid gap-2 md:hidden">{entries.items.map((entry) => (
                <li key={entry.id} className="flex items-start justify-between gap-3 rounded-lg border border-stone-200 p-3">
                  <div className="grid min-w-0 gap-1">
                    {entryLabel(entry)}
                    <div className="flex flex-wrap items-center gap-2 text-xs text-stone-500">
                      Назначений: {entry.count}
                      <Badge variant="outline">{entry.editorial ? "Редакционный" : "Обычный"}</Badge>
                    </div>
                  </div>
                  {editorialAction(entry)}
                </li>
              ))}</ul>
              <PaginationNav basePath={editHref} itemLabel="записей" page={entries.page} pageSize={entries.pageSize}
                searchParams={{}} totalCount={entries.total} totalPages={entries.totalPages} />
            </>
          ) : <EmptyState>Тег пока не назначен ни одной записи.</EmptyState>}
        </CardContent>
      </Card>
    </div>
  );
}
