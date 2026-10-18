import Link from "next/link";
import type { PlatformRequestListItem } from "@/db/queries/platform-requests";
import { Table, TBody, TD, TH, THead, TR, TableWrap } from "@/components/ui/table";
import { EmptyState } from "../admin-ui";
import { platformProviderLabel, platformProviderName, platformRequestDate, PlatformRequestStatus } from "./presentation";

export function PlatformRequestsList({ requests, all = false, searching = false }: { requests: readonly PlatformRequestListItem[]; all?: boolean; searching?: boolean }) {
  return !requests.length ? <EmptyState>{searching ? "Заявки не найдены." : all ? "Заявок на платформы пока нет." : "Нет платформ, ожидающих решения."}</EmptyState> : <>
      <div className="grid gap-3 md:hidden">{requests.map((request) => <article key={request.id} className="min-w-0 rounded-lg border border-stone-200 bg-white p-4">
        <Link href={`/admin/platform-requests/${request.id}`} className="break-words font-medium underline underline-offset-4">{platformProviderName(request.provider, request.externalPlatformName)}</Link>
        <p className="mt-2 text-sm text-stone-500">{platformProviderLabel(request.provider)} · {request.mediaTypeName}</p>
        <div className="mt-3"><PlatformRequestStatus status={request.status} /></div>
        <p className="mt-3 text-sm text-stone-600">Записей: {request.occurrenceCount}</p>
        <p className="mt-1 text-xs text-stone-500">Обнаружена: {platformRequestDate(request.firstSeenAt)}</p>
      </article>)}</div>
      <TableWrap className="hidden md:block"><Table className="table-fixed"><THead><tr>
        <TH>Платформа провайдера</TH><TH>Провайдер / тип</TH><TH className="w-24">Записей</TH><TH className="w-44">Обнаружен</TH><TH className="w-44">Статус</TH>
      </tr></THead><TBody>{requests.map((request) => <TR key={request.id}>
        <TD><Link href={`/admin/platform-requests/${request.id}`} className="break-words font-medium underline underline-offset-4">{platformProviderName(request.provider, request.externalPlatformName)}</Link></TD>
        <TD>{platformProviderLabel(request.provider)}<p className="mt-1 text-xs text-stone-500">{request.mediaTypeName}</p></TD>
        <TD>{request.occurrenceCount}</TD><TD>{platformRequestDate(request.firstSeenAt)}</TD><TD><PlatformRequestStatus status={request.status} /></TD>
      </TR>)}</TBody></Table></TableWrap>
    </>;
}
