import Link from "next/link";
import { getCreatorRequests } from "@/db/queries/creator-requests";
import { Table, TableWrap, THead, TBody, TR, TH, TD } from "@/components/ui/table";
import { buttonVariants } from "@/components/ui/button";
import { AdminToasts } from "../admin-toasts";
import { PageHeader, EmptyState } from "../admin-ui";
import { CreatorRequestStatus } from "./presentation";

export default async function CreatorRequestsPage({ searchParams }: { searchParams: Promise<{ all?: string; error?: string; updated?: string }> }) {
  const query = await searchParams;
  const requests = await getCreatorRequests({ all: query.all === "1" });
  return <div className="grid gap-5">
    <PageHeader title="Заявки на создателей" description="Авторы книг, создатели настолок, разработчики и издатели компьютерных игр из провайдеров." aside={<Link href={query.all === "1" ? "/admin/creator-requests" : "/admin/creator-requests?all=1"} className={buttonVariants({ variant: "outline" })}>{query.all === "1" ? "Ожидающие решения" : "Все решения"}</Link>} />
    <AdminToasts clearParams={["error", "updated"]} messages={query.error ? [{ id: "error", tone: "error", text: "Не удалось выполнить действие. Проверьте состояние заявки." }] : query.updated ? [{ id: "updated", tone: "success", text: "Решение сохранено. Пересчёт связей поставлен в очередь." }] : []} />
    {!requests.length ? <EmptyState>Нет создателей, ожидающих решения.</EmptyState> : <>
      <div className="grid gap-3 md:hidden">{requests.map(request => <article key={request.id} className="grid gap-2 rounded-lg border border-stone-200 bg-white p-4"><Link href={`/admin/creator-requests/${request.id}`} className="font-medium underline underline-offset-4">{request.externalCreatorName}</Link><p className="text-sm text-stone-500">{request.provider}{request.externalCreatorId ? ` #${request.externalCreatorId}` : ""} · {request.occurrenceCount} записей{request.roles.length ? ` · ${request.roles.join(", ")}` : ""}</p><CreatorRequestStatus status={request.status} /></article>)}</div>
      <TableWrap className="hidden md:block"><Table><THead><TR><TH>Имя провайдера</TH><TH>Провайдер</TH><TH>Записей</TH><TH>Обнаружен</TH><TH>Статус</TH></TR></THead><TBody>{requests.map(request => <TR key={request.id}><TD><Link href={`/admin/creator-requests/${request.id}`} className="font-medium underline underline-offset-4">{request.externalCreatorName}</Link></TD><TD>{request.provider}{request.externalCreatorId ? <p className="text-xs text-stone-500">ID {request.externalCreatorId}</p> : null}{request.roles.length ? <p className="text-xs text-stone-500">{request.roles.join(", ")}</p> : null}</TD><TD>{request.occurrenceCount}</TD><TD>{request.firstSeenAt.toLocaleDateString("ru-RU", { timeZone: "Europe/Moscow" })}</TD><TD><CreatorRequestStatus status={request.status} /></TD></TR>)}</TBody></Table></TableWrap>
    </>}
  </div>;
}
