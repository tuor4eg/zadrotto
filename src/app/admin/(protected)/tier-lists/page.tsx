import Link from "next/link";
import { getTierListAdminPage } from "@/db/queries/tier-lists";
import { Eye, EyeOff, Pencil, Trash2 } from "lucide-react";
import { Button, buttonVariants } from "@/components/ui/button";
import { ConfirmAction } from "@/components/ui/confirm-action";
import { Table, TableWrap, TBody, TD, TH, THead, TR } from "@/components/ui/table";
import { PageHeader, EmptyState } from "../admin-ui";
import { moderateAction } from "./actions";
import { TierListFilters } from "./tier-list-filters";
import { TierListToasts } from "./tier-list-toasts";

type Item = Awaited<ReturnType<typeof getTierListAdminPage>>["items"][number];
function Actions({ item }: { item: Item }) {
  return <div className="flex items-center justify-end gap-2">
    <Link className={buttonVariants({ variant: "outline", size: "icon" })} href={`/admin/tier-lists/${item.publicId}/edit`} aria-label="Редактировать" title="Редактировать"><Pencil className="size-4" /></Link>
    <form action={moderateAction}>
      <input name="publicId" type="hidden" value={item.publicId} />
      <input name="action" type="hidden" value={item.hiddenAt ? "restore" : "hide"} />
      <Button type="submit" variant="outline" size="icon" aria-label={item.hiddenAt ? "Восстановить" : "Скрыть"} title={item.hiddenAt ? "Восстановить" : "Скрыть"}>{item.hiddenAt ? <Eye className="size-4" /> : <EyeOff className="size-4" />}</Button>
    </form>
    <ConfirmAction action={moderateAction} title="Удалить тир-лист?" description="Тир-лист будет удалён без возможности восстановления." confirmLabel="Удалить" triggerLabel="Удалить" triggerAriaLabel="Удалить тир-лист" triggerIcon={<Trash2 className="size-4" />} triggerSize="icon" fields={[{ name: "publicId", value: item.publicId }, { name: "action", value: "delete" }]} />
  </div>;
}
function Status({ item }: { item: Item }) { return <span>{item.hiddenAt ? "Скрыт" : item.status === "published" ? "Опубликован" : "Черновик"}</span>; }
export default async function TierListsAdminPage({ searchParams }: { searchParams: Promise<{ q?: string; authorId?: string; status?: string; page?: string; error?: string; saved?: string }> }) {
  const params = await searchParams;
  const authorId = Number(params.authorId) || undefined;
  const status = params.status === "draft" || params.status === "published" || params.status === "hidden" ? params.status : undefined;
  const result = await getTierListAdminPage({ q: params.q, authorId, status, page: Number(params.page) || 1 });
  const pageHref = (page: number) => `/admin/tier-lists?${new URLSearchParams({ ...(params.q ? { q: params.q } : {}), ...(authorId ? { authorId: String(authorId) } : {}), ...(status ? { status } : {}), page: String(page) })}`;
  return <div className="grid gap-5"><PageHeader title="Тир-листы" description="Создание, редактирование и модерация тир-листов." aside={<Link href="/admin/tier-lists/new" className={buttonVariants()}>Создать тир-лист</Link>} />
    <TierListToasts error={params.error} saved={params.saved} />
    <TierListFilters searchQuery={params.q ?? ""} authorId={authorId ? String(authorId) : ""} status={status ?? ""} />
    {result.items.length ? <><div className="grid gap-3 md:hidden">{result.items.map((item) => <article className="grid gap-3 rounded-lg border bg-white p-4" key={item.id}><h2 className="font-medium">{item.title}</h2><p>{item.authorName} · #{item.authorId}</p><Status item={item} /><Actions item={item} /></article>)}</div><TableWrap className="hidden md:block"><Table><THead><tr><TH>Название</TH><TH>Автор</TH><TH>Состояние</TH><TH className="text-right">Действия</TH></tr></THead><TBody>{result.items.map((item) => <TR key={item.id}><TD><Link href={`/admin/tier-lists/${item.publicId}/edit`}>{item.title}</Link></TD><TD>{item.authorName} · #{item.authorId}</TD><TD><Status item={item} /></TD><TD><Actions item={item} /></TD></TR>)}</TBody></Table></TableWrap></> : <EmptyState>Тир-листов с такими параметрами нет.</EmptyState>}
    <nav aria-label="Страницы" className="flex items-center gap-4">{result.page > 1 ? <Link href={pageHref(result.page - 1)}>Назад</Link> : null}<span>{result.page} / {Math.max(1, result.totalPages)}</span>{result.page < result.totalPages ? <Link href={pageHref(result.page + 1)}>Далее</Link> : null}</nav>
  </div>;
}
