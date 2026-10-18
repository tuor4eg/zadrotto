import Link from "next/link";
import { notFound } from "next/navigation";
import { getCreatorRequests, getCreatorRequestEntries } from "@/db/queries/creator-requests";
import { getCreatorOptions } from "@/db/queries/creators";
import { Button, buttonVariants } from "@/components/ui/button";
import { AdminToasts } from "../../admin-toasts";
import { PageHeader } from "../../admin-ui";
import { GenreRequestAutoRefresh } from "../../genre-requests/auto-refresh";
import { retryCreatorAction } from "../../creators/actions";
import { CreatorDecisionForm } from "../decision-form";
import { CreatorRequestStatus } from "../presentation";

export default async function CreatorRequestPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const requestId = Number(id);
  if (!Number.isSafeInteger(requestId) || requestId < 1) notFound();
  const [requests, creators, entries] = await Promise.all([getCreatorRequests({ all: true, requestId }), getCreatorOptions(), getCreatorRequestEntries(requestId)]);
  const request = requests.find(row => row.id === requestId);
  if (!request) notFound();
  return <div className="grid gap-5">
    <PageHeader title={request.externalCreatorName} description={`${request.provider}${request.externalCreatorId ? ` #${request.externalCreatorId}` : ""} · записей: ${request.occurrenceCount}${request.roles.length ? ` · ${request.roles.join(", ")}` : ""}`} aside={<Link href="/admin/creator-requests" className={buttonVariants({ variant: "outline" })}>К заявкам</Link>} />
    <CreatorRequestStatus status={request.status} />
    {request.provider === "bgg" && request.externalCreatorId ? <a href={`https://boardgamegeek.com/boardgamedesigner/${request.externalCreatorId}`} target="_blank" rel="noreferrer" className="text-sm underline">Создатель BGG #{request.externalCreatorId}</a> : null}
    <section className="grid gap-2"><h2 className="font-semibold">Связанные записи</h2>{entries.length ? <ul className="grid gap-2 text-sm">{entries.map(entry => <li key={`${entry.id}:${entry.roleName ?? "writer"}`}><Link href={`/admin/media/${entry.id}/edit`} className="underline underline-offset-4">{entry.title}</Link>{entry.roleName ? <span className="ml-2 text-stone-500">{entry.roleName}</span> : null}</li>)}</ul> : <p className="text-sm text-stone-500">Нет текущих связанных записей.</p>}</section>
    <GenreRequestAutoRefresh enabled={request.status === "applying"} />
    <AdminToasts clearParams={[]} messages={request.jobError ? [{ id: "error", tone: "error", text: request.jobError }] : []} />
    {request.status === "pending" ? <CreatorDecisionForm requestId={request.id} name={request.externalCreatorName} provider={request.provider} people={request.provider === "bgg" ? creators : creators.filter(creator => creator.typeCode === "person")} /> : null}
    {request.status === "applying" ? <p className="text-sm text-stone-500">Связи записей пересчитываются. Страница обновится автоматически.</p> : null}
    {request.status === "failed" ? <form action={retryCreatorAction}><input type="hidden" name="requestId" value={request.id} /><Button type="submit" variant="outline">Повторить применение</Button></form> : null}
    {request.status === "processed" ? <p className="text-sm text-stone-500">Решение применено к записям.</p> : null}
  </div>;
}
