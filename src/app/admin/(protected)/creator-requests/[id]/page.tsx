import Link from "next/link";
import { notFound } from "next/navigation";
import { getCreatorRequests, getCreatorRequestEntries } from "@/db/queries/creator-requests";
import { getCreatorOptions, getCreatorProviderBindings } from "@/db/queries/creators";
import { getGameCompanyRequestProfile } from "@/db/queries/game-companies";
import { getExternalCompanyImageUrl } from "@/lib/creators/game-company-images";
import Image from "next/image";
import { Button, buttonVariants } from "@/components/ui/button";
import { AdminToasts } from "../../admin-toasts";
import { PageHeader } from "../../admin-ui";
import { GenreRequestAutoRefresh } from "../../genre-requests/auto-refresh";
import { retryCreatorAction } from "../../creators/actions";
import { CreatorDecisionForm } from "../decision-form";
import { CreatorRequestStatus } from "../presentation";

const PROFILE_LABELS: Record<string, string> = {
  description: "Описание", country: "Страна", websites: "Сайты", parent: "Материнская компания (ID)",
  changed_company_id: "Компания после изменения (ID)", slug: "Обозначение провайдера", image_background: "Фоновое изображение", games_count: "Игр у провайдера",
};

export default async function CreatorRequestPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const requestId = Number(id);
  if (!Number.isSafeInteger(requestId) || requestId < 1) notFound();
  const [requests, creators, entries] = await Promise.all([getCreatorRequests({ all: true, requestId }), getCreatorOptions(), getCreatorRequestEntries(requestId)]);
  const request = requests.find(row => row.id === requestId);
  if (!request) notFound();
  const isOrganization = request.provider === "igdb" || request.provider === "rawg";
  const candidates = isOrganization ? creators.filter(creator => creator.typeCode === "organization") : request.provider === "bgg" ? creators : creators.filter(creator => creator.typeCode === "person");
  const [profile, bindings] = await Promise.all([
    isOrganization && request.externalCreatorId ? getGameCompanyRequestProfile(request.provider, request.externalCreatorId) : Promise.resolve(null),
    isOrganization ? getCreatorProviderBindings(candidates.map(creator => creator.id)) : Promise.resolve([]),
  ]);
  const people = candidates.map(creator => ({ ...creator, bindings: bindings.filter(binding => binding.creatorId === creator.id).map(({ provider, externalCreatorId }) => ({ provider, externalCreatorId })) }));
  const logoUrl = profile?.imageObjectKey ? getExternalCompanyImageUrl(profile.imageObjectKey) : null;
  return <div className="grid gap-5">
    <PageHeader title={request.externalCreatorName} description={`${request.provider}${request.externalCreatorId ? ` #${request.externalCreatorId}` : ""} · записей: ${request.occurrenceCount}${request.roles.length ? ` · ${request.roles.join(", ")}` : ""}`} aside={<Link href="/admin/creator-requests" className={buttonVariants({ variant: "outline" })}>К заявкам</Link>} />
    {profile ? <section className="flex flex-wrap items-start gap-4 rounded-lg border border-stone-200 p-4">
      {logoUrl ? <Image src={logoUrl} alt={`Логотип ${profile.name}`} width={80} height={80} unoptimized className="size-20 object-contain" /> : null}
      <div className="min-w-0 flex-1"><h2 className="font-semibold">{profile.name}</h2>
        {profile.sourceUrl ? <a href={profile.sourceUrl} target="_blank" rel="noreferrer" className="text-sm underline underline-offset-4">Страница организации у провайдера</a> : null}
        {profile.details ? <dl className="mt-3 grid gap-2 text-sm">{Object.entries(profile.details).filter(([, value]) => value !== null && value !== undefined && value !== "").map(([key, value]) => <div key={key}><dt className="text-xs text-stone-500">{PROFILE_LABELS[key] ?? key}</dt><dd className="break-words">{typeof value === "string" || typeof value === "number" ? String(value) : JSON.stringify(value)}</dd></div>)}</dl> : null}
      </div>
    </section> : null}
    <CreatorRequestStatus status={request.status} />
    {request.provider === "bgg" && request.externalCreatorId ? <a href={`https://boardgamegeek.com/boardgamedesigner/${request.externalCreatorId}`} target="_blank" rel="noreferrer" className="text-sm underline">Создатель BGG #{request.externalCreatorId}</a> : null}
    <section className="grid gap-2"><h2 className="font-semibold">Связанные записи</h2>{entries.length ? <ul className="grid gap-2 text-sm">{entries.map(entry => <li key={`${entry.id}:${entry.roleName ?? "writer"}`}><Link href={`/admin/media/${entry.id}/edit`} className="underline underline-offset-4">{entry.title}</Link>{entry.roleName ? <span className="ml-2 text-stone-500">{entry.roleName}</span> : null}</li>)}</ul> : <p className="text-sm text-stone-500">Нет текущих связанных записей.</p>}</section>
    <GenreRequestAutoRefresh enabled={request.status === "applying"} />
    <AdminToasts clearParams={[]} messages={request.jobError ? [{ id: "error", tone: "error", text: request.jobError }] : []} />
    {request.status === "pending" ? <CreatorDecisionForm requestId={request.id} name={request.externalCreatorName} provider={request.provider} people={people} /> : null}
    {request.status === "applying" ? <p className="text-sm text-stone-500">Связи записей пересчитываются. Страница обновится автоматически.</p> : null}
    {request.status === "failed" ? <form action={retryCreatorAction}><input type="hidden" name="requestId" value={request.id} /><Button type="submit" variant="outline">Повторить применение</Button></form> : null}
    {request.status === "processed" ? <p className="text-sm text-stone-500">Решение применено к записям.</p> : null}
  </div>;
}
