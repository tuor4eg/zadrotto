import { reopenGenreMappingAction } from "./actions";
import Link from "next/link";
import { Edit3 } from "lucide-react";

import { Badge } from "@/components/ui/badge";
import { buttonVariants } from "@/components/ui/button";
import { Table, TBody, TD, TH, THead, TR, TableWrap } from "@/components/ui/table";
import { getAdminGenresPage, type AdminGenre } from "@/db/queries/genres";
import { AdminToasts } from "../admin-toasts";
import { EmptyState, PageHeader } from "../admin-ui";
import { getGenreErrorMessage } from "./messages";
import { GenreProviderVariants } from "./provider-variants";
import { GenreSearch } from "./genre-search";
import { CancelledGenres } from "./cancelled-genres";

function GenreIdentity({ genre }: { genre: AdminGenre }) {
  return <div className="min-w-0">
    <div className="break-words font-medium text-stone-950">{genre.name}</div>
    <div className="mt-1 break-all font-mono text-xs text-stone-500">{genre.slug}</div>
    {!genre.isActive ? <Badge variant="warning" className="mt-2">Неактивен</Badge> : null}
  </div>;
}

function GenreEditLink({ genre }: { genre: AdminGenre }) {
  return <Link href={`/admin/genres/${genre.id}/edit`} className={buttonVariants({ variant: "outline", size: "sm" })}
    aria-label={`Редактировать жанр ${genre.name}`}><Edit3 />Редактировать</Link>;
}

export default async function GenresPage({ searchParams }: { searchParams: Promise<{ error?: string; q?: string; page?: string; tab?: string }> }) {
  const query = await searchParams;
  const searchQuery = query.q ?? "";
  const cancelled = query.tab === "cancelled";
  const tabs = <nav aria-label="Статус жанров" className="flex flex-wrap gap-2">
    <Link href="/admin/genres" aria-current={!cancelled ? "page" : undefined} className={buttonVariants({ variant: cancelled ? "outline" : "default", size: "sm" })}>Активные</Link>
    <Link href="/admin/genres?tab=cancelled" aria-current={cancelled ? "page" : undefined} className={buttonVariants({ variant: cancelled ? "default" : "outline", size: "sm" })}>Отменённые</Link>
  </nav>;
  if (cancelled) return <div className="grid gap-5">
    <PageHeader title="Жанры" description="Названия жанров в карточках записей и их варианты у провайдеров." />
    <AdminToasts clearParams={["error"]} messages={query.error === "restore" ? [{ id: "restore", tone: "error", text: "Не удалось восстановить жанр. Возможно, решение ещё применяется или значение уже изменено." }] : []} />
    {tabs}<GenreSearch searchQuery={searchQuery} cancelled />
    <CancelledGenres searchQuery={searchQuery} page={Number(query.page ?? 1)} />
  </div>;
  const result = await getAdminGenresPage({ searchQuery, page: Number(query.page ?? 1) });
  const genres = result.items;
  const pageUrl = (page: number) => `/admin/genres?${new URLSearchParams({ ...(searchQuery ? { q: searchQuery } : {}), page: String(page) })}`;
  const error = getGenreErrorMessage(query.error);
  return (
    <div className="grid gap-5">
      <PageHeader title="Жанры" description="Названия жанров в карточках записей и их варианты у провайдеров." />
      <AdminToasts clearParams={["error"]} messages={error ? [{ id: "error", tone: "error", text: error }] : []} />
      {tabs}<GenreSearch searchQuery={searchQuery} />
      <p className="text-sm text-stone-500">Жанров: {result.total}</p>
      {genres.length === 0 ? <EmptyState>{searchQuery ? "Жанры не найдены." : "Жанры пока не добавлены."}</EmptyState> : <>
        <div className="grid gap-3 md:hidden">
          {genres.map((genre) => <article key={genre.id} className="min-w-0 rounded-lg border border-stone-200 bg-white p-4">
            <GenreIdentity genre={genre} />
            <div className="mt-4"><p className="mb-2 text-xs font-medium text-stone-500">Варианты у провайдеров</p>
              <GenreProviderVariants groups={genre.providerVariants} reopenAction={reopenGenreMappingAction} /></div>
            <div className="mt-4 flex flex-wrap items-center justify-between gap-3">
              <span className="text-sm text-stone-600">Записей: {genre.mediaItemsCount}</span><GenreEditLink genre={genre} />
            </div>
          </article>)}
        </div>
        <TableWrap className="hidden md:block">
          <Table className="table-fixed">
            <THead><tr><TH className="w-1/4">Наш жанр</TH><TH>Варианты у провайдеров</TH>
              <TH className="w-24">Записей</TH><TH className="w-44 text-right">Действия</TH></tr></THead>
            <TBody>{genres.map((genre) => <TR key={genre.id}>
              <TD><GenreIdentity genre={genre} /></TD><TD><GenreProviderVariants groups={genre.providerVariants} reopenAction={reopenGenreMappingAction} /></TD>
              <TD><Badge variant="outline">{genre.mediaItemsCount}</Badge></TD><TD className="text-right"><GenreEditLink genre={genre} /></TD>
            </TR>)}</TBody>
          </Table>
        </TableWrap>
      </>}
      {result.totalPages > 1 ? <nav aria-label="Страницы жанров" className="flex flex-wrap items-center gap-3">
        {result.page > 1 ? <Link href={pageUrl(result.page - 1)} className={buttonVariants({ variant: "outline", size: "sm" })}>Назад</Link> : null}
        <span className="text-sm text-stone-500">{result.page} / {result.totalPages}</span>
        {result.page < result.totalPages ? <Link href={pageUrl(result.page + 1)} className={buttonVariants({ variant: "outline", size: "sm" })}>Далее</Link> : null}
      </nav> : null}
    </div>
  );
}
