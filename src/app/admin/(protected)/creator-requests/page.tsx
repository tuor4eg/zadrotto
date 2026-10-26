import { getCreatorRequestErrorMessage } from "./messages";
import Link from "next/link";
import { getCreatorRequestsPage } from "@/db/queries/creator-requests";
import { PaginationNav } from "@/components/pagination-nav";
import { parsePage } from "@/lib/common/pagination";
import { Table, TableWrap, THead, TBody, TR, TH, TD } from "@/components/ui/table";
import { buttonVariants } from "@/components/ui/button";
import { AdminToasts } from "../admin-toasts";
import { PageHeader, EmptyState } from "../admin-ui";
import { CreatorRequestStatus } from "./presentation";

export default async function CreatorRequestsPage({ searchParams }: { searchParams: Promise<{ all?: string; page?: string; error?: string; updated?: string }> }) {
  const query = await searchParams;
  const result = await getCreatorRequestsPage({ all: query.all === "1", page: parsePage(query.page) });
  const requests = result.items;
  return <div className="grid gap-5">
    <PageHeader title="Заявки на создателей" description="Создатели и организации из провайдеров, включая совпадения для поиска логотипов." aside={<Link href={query.all === "1" ? "/admin/creator-requests" : "/admin/creator-requests?all=1"} className={buttonVariants({ variant: "outline" })}>{query.all === "1" ? "Ожидающие решения" : "Все решения"}</Link>} />
    <AdminToasts clearParams={["error", "updated"]} messages={query.error ? [{ id: "error", tone: "error", text: getCreatorRequestErrorMessage(query.error) }] : query.updated ? [{ id: "updated", tone: "success", text: "Решение сохранено." }] : []} />
    <p className="text-sm text-stone-500">Заявок: {result.totalCount}</p>
    {!requests.length ? <EmptyState>{query.all === "1" ? "Заявок пока нет." : "Нет создателей, ожидающих решения."}</EmptyState> : <>
      <div className="grid gap-3 md:hidden">{requests.map(request => <article key={request.id} className="grid gap-2 rounded-lg border border-stone-200 bg-white p-4"><Link href={`/admin/creator-requests/${request.id}`} className="font-medium underline underline-offset-4">{request.externalCreatorName}</Link><p className="text-sm text-stone-500">{request.provider}{request.externalCreatorId ? ` #${request.externalCreatorId}` : ""} · {request.logoCandidateCount > 0 && request.occurrenceCount === 0 ? "Поиск логотипа" : `${request.occurrenceCount} записей`}{request.roles.length ? ` · ${request.roles.join(", ")}` : ""}</p>{request.logoCandidateCount > 0 && request.occurrenceCount === 0 && request.pendingLogoCandidateCount === 0 && request.decision === null ? <p className="text-sm font-medium text-stone-600">Все совпадения отклонены</p> : <CreatorRequestStatus status={request.status} />}{request.legacyLogoIgnore ? <p className="text-sm text-amber-700">Проверить прежний общий игнор</p> : request.pendingLogoCandidateCount > 0 ? <p className="text-sm text-stone-500">Совпадений для проверки: {request.pendingLogoCandidateCount}</p> : null}</article>)}</div>
      <TableWrap className="hidden md:block"><Table><THead><TR><TH>Имя провайдера</TH><TH>Провайдер</TH><TH>Записей</TH><TH>Обнаружен</TH><TH>Статус</TH></TR></THead><TBody>{requests.map(request => <TR key={request.id}><TD><Link href={`/admin/creator-requests/${request.id}`} className="font-medium underline underline-offset-4">{request.externalCreatorName}</Link></TD><TD>{request.provider}{request.externalCreatorId ? <p className="text-xs text-stone-500">ID {request.externalCreatorId}</p> : null}{request.roles.length ? <p className="text-xs text-stone-500">{request.roles.join(", ")}</p> : null}</TD><TD>{request.logoCandidateCount > 0 && request.occurrenceCount === 0 ? "Поиск логотипа" : request.occurrenceCount}</TD><TD>{request.firstSeenAt.toLocaleDateString("ru-RU", { timeZone: "Europe/Moscow" })}</TD><TD>{request.logoCandidateCount > 0 && request.occurrenceCount === 0 && request.pendingLogoCandidateCount === 0 && request.decision === null ? <p className="text-sm font-medium text-stone-600">Все совпадения отклонены</p> : <CreatorRequestStatus status={request.status} />}{request.legacyLogoIgnore ? <p className="text-sm text-amber-700">Проверить прежний общий игнор</p> : request.pendingLogoCandidateCount > 0 ? <p className="text-sm text-stone-500">Совпадений для проверки: {request.pendingLogoCandidateCount}</p> : null}</TD></TR>)}</TBody></Table></TableWrap>
    </>}
    <PaginationNav basePath="/admin/creator-requests" itemLabel="заявок" page={result.page} pageSize={result.pageSize} totalCount={result.totalCount} totalPages={result.totalPages} searchParams={{ all: query.all === "1" ? "1" : undefined }} showPageJump />
  </div>;
}
