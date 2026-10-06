import Link from "next/link";
import type { GenreRequestListItem } from "@/db/queries/genre-requests";
import { Table, TBody, TD, TH, THead, TR, TableWrap } from "@/components/ui/table";
import { EmptyState } from "../admin-ui";
import { genreProviderLabel, genreRequestDate, GenreRequestStatus } from "./presentation";

export function GenreRequestsList({ requests, all }: { requests: readonly GenreRequestListItem[]; all: boolean }) {
  return !requests.length ? <EmptyState>{all ? "Заявок на жанры пока нет." : "Нет жанров, ожидающих решения."}</EmptyState> : <>
      <div className="grid gap-3 md:hidden">{requests.map((request) => <article key={request.id} className="min-w-0 rounded-lg border border-stone-200 bg-white p-4">
        <Link href={`/admin/genre-requests/${request.id}`} className="break-words font-medium underline underline-offset-4">{request.externalGenreName}</Link>
        <p className="mt-2 text-sm text-stone-500">{genreProviderLabel(request.provider)} · {request.mediaTypeName}</p>
        <div className="mt-3"><GenreRequestStatus status={request.status} /></div>
        <p className="mt-3 text-sm text-stone-600">Записей: {request.occurrenceCount}</p>
        <p className="mt-1 text-xs text-stone-500">Обнаружен: {genreRequestDate(request.firstSeenAt)}</p>
      </article>)}</div>
      <TableWrap className="hidden md:block"><Table className="table-fixed"><THead><tr>
        <TH>Жанр провайдера</TH><TH>Провайдер / тип</TH><TH className="w-24">Записей</TH><TH className="w-44">Обнаружен</TH><TH className="w-44">Статус</TH>
      </tr></THead><TBody>{requests.map((request) => <TR key={request.id}>
        <TD><Link href={`/admin/genre-requests/${request.id}`} className="break-words font-medium underline underline-offset-4">{request.externalGenreName}</Link></TD>
        <TD>{genreProviderLabel(request.provider)}<p className="mt-1 text-xs text-stone-500">{request.mediaTypeName}</p></TD>
        <TD>{request.occurrenceCount}</TD><TD>{genreRequestDate(request.firstSeenAt)}</TD><TD><GenreRequestStatus status={request.status} /></TD>
      </TR>)}</TBody></Table></TableWrap>
    </>;
}
