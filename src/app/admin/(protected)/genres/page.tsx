import Link from "next/link";
import { Edit3 } from "lucide-react";

import { Badge } from "@/components/ui/badge";
import { buttonVariants } from "@/components/ui/button";
import { Table, TBody, TD, TH, THead, TR, TableWrap } from "@/components/ui/table";
import { getAdminGenres, type AdminGenre } from "@/db/queries/genres";
import { AdminToasts } from "../admin-toasts";
import { EmptyState, PageHeader } from "../admin-ui";
import { getGenreErrorMessage } from "./messages";
import { GenreProviderVariants } from "./provider-variants";

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

export default async function GenresPage({ searchParams }: { searchParams: Promise<{ error?: string }> }) {
  const [genres, query] = await Promise.all([getAdminGenres(), searchParams]);
  const error = getGenreErrorMessage(query.error);
  return (
    <div className="grid gap-5">
      <PageHeader title="Жанры" description="Названия жанров в карточках записей и их варианты у провайдеров." />
      <AdminToasts clearParams={["error"]} messages={error ? [{ id: "error", tone: "error", text: error }] : []} />
      {genres.length === 0 ? <EmptyState>Жанры пока не добавлены.</EmptyState> : <>
        <div className="grid gap-3 md:hidden">
          {genres.map((genre) => <article key={genre.id} className="min-w-0 rounded-lg border border-stone-200 bg-white p-4">
            <GenreIdentity genre={genre} />
            <div className="mt-4"><p className="mb-2 text-xs font-medium text-stone-500">Варианты у провайдеров</p>
              <GenreProviderVariants groups={genre.providerVariants} /></div>
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
              <TD><GenreIdentity genre={genre} /></TD><TD><GenreProviderVariants groups={genre.providerVariants} /></TD>
              <TD><Badge variant="outline">{genre.mediaItemsCount}</Badge></TD><TD className="text-right"><GenreEditLink genre={genre} /></TD>
            </TR>)}</TBody>
          </Table>
        </TableWrap>
      </>}
    </div>
  );
}
