import Link from "next/link";
import { Button, buttonVariants } from "@/components/ui/button";
import { Table, TBody, TD, TH, THead, TR, TableWrap } from "@/components/ui/table";
import { getGenreExclusionsPage } from "@/db/queries/genre-exclusions";
import { EmptyState } from "../admin-ui";
import { genreProviderLabel, genreProviderName } from "../genre-requests/presentation";
import { restoreGenreExclusionAction } from "./actions";

export async function CancelledGenres({ searchQuery, page }: { searchQuery: string; page: number }) {
  const result = await getGenreExclusionsPage({ searchQuery, page });
  const pageUrl = (next: number) => `/admin/genres?${new URLSearchParams({ tab: "cancelled", q: searchQuery, page: String(next) })}`;
  const restore = (item: typeof result.items[number]) => <form action={restoreGenreExclusionAction}>
    <input type="hidden" name="exclusionId" value={item.id} />
    <Button type="submit" variant="outline" size="sm" disabled={item.applying}>{item.applying ? "Применяется…" : "Вернуть в активные"}</Button>
  </form>;
  return <>
    <p className="text-sm text-stone-500">Отменённых: {result.total}. Восстановленное значение вернётся в заявки для выбора нашего жанра.</p>
    {!result.items.length ? <EmptyState>{searchQuery ? "Отменённые жанры не найдены." : "Отменённых жанров пока нет."}</EmptyState> : <>
      <div className="grid gap-3 md:hidden">{result.items.map((item) => <article key={item.id} className="min-w-0 rounded-lg border border-stone-200 bg-white p-4">
        <p className="break-words font-medium">{genreProviderName(item.provider, item.name)}</p>
        <p className="mb-3 mt-2 text-sm text-stone-500">{genreProviderLabel(item.provider)} · {item.mediaTypeName}</p>{restore(item)}
      </article>)}</div>
      <TableWrap className="hidden md:block"><Table><THead><tr><TH>Жанр провайдера</TH><TH>Провайдер / тип</TH><TH>Действия</TH></tr></THead>
        <TBody>{result.items.map((item) => <TR key={item.id}><TD>{genreProviderName(item.provider, item.name)}</TD>
          <TD>{genreProviderLabel(item.provider)} · {item.mediaTypeName}</TD><TD>{restore(item)}</TD></TR>)}</TBody>
      </Table></TableWrap>
    </>}
    {result.totalPages > 1 ? <nav aria-label="Страницы отменённых жанров" className="flex flex-wrap items-center gap-3">
      {result.page > 1 ? <Link href={pageUrl(result.page - 1)} className={buttonVariants({ variant: "outline", size: "sm" })}>Назад</Link> : null}
      <span className="text-sm text-stone-500">{result.page} / {result.totalPages}</span>
      {result.page < result.totalPages ? <Link href={pageUrl(result.page + 1)} className={buttonVariants({ variant: "outline", size: "sm" })}>Далее</Link> : null}
    </nav> : null}
  </>;
}
