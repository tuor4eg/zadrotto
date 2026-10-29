import { getAnimeCompanyLogoCandidates } from "@/db/queries/anime-company-logo-binding";
import { confirmLogoCandidateAction, rejectLogoCandidateAction, repairLogoIgnoreAction } from "../logo-actions";
import { getCreatorRequestErrorMessage } from "../messages";
import { isOrganizationCreatorRequest } from "@/lib/creators/request-kind";
import Link from "next/link";
import { notFound } from "next/navigation";
import { getCreatorRequests, getCreatorRequestEntries } from "@/db/queries/creator-requests";
import { getCreatorOptions, getCreatorProviderBindings, getCreatorProviderVariants } from "@/db/queries/creators";
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
  suggestedCreatorIds: "Предлагаемые организации (ID)", anilistStudioId: "Студия AniList", searchSnapshotId: "Снимок поиска TMDB",
  logoPath: "Путь логотипа TMDB", snapshotId: "Снимок TMDB", payloadHash: "Хеш снимка",
  description: "Описание", country: "Страна", websites: "Сайты", parent: "Материнская компания (ID)",
  changed_company_id: "Компания после изменения (ID)", slug: "Обозначение провайдера", image_background: "Фоновое изображение", games_count: "Игр у провайдера",
};

export default async function CreatorRequestPage({ params, searchParams }: { params: Promise<{ id: string }>; searchParams: Promise<{ error?: string }> }) {
  const { id } = await params;
  const requestId = Number(id);
  if (!Number.isSafeInteger(requestId) || requestId < 1) notFound();
  const [requests, creators, entries, logoCandidates, query] = await Promise.all([getCreatorRequests({ all: true, requestId }), getCreatorOptions(), getCreatorRequestEntries(requestId), getAnimeCompanyLogoCandidates(requestId), searchParams]);
  const request = requests.find(row => row.id === requestId);
  if (!request) notFound();
  const isOrganization = isOrganizationCreatorRequest(request.provider, request.externalCreatorId);
  const candidates = isOrganization ? creators.filter(creator => creator.typeCode === "organization") : request.provider === "bgg" ? creators : creators.filter(creator => creator.typeCode === "person");
  const [profile, bindings, variants] = await Promise.all([
    isOrganization && request.externalCreatorId ? getGameCompanyRequestProfile(request.provider, request.externalCreatorId) : Promise.resolve(null),
    getCreatorProviderBindings(candidates.map(creator => creator.id)),
    getCreatorProviderVariants(candidates.map(creator => creator.id)),
  ]);
  const suggestedCreatorIds = Array.isArray(profile?.details?.suggestedCreatorIds) ? profile.details.suggestedCreatorIds.filter((id): id is number => typeof id === "number" && Number.isSafeInteger(id) && id > 0) : [];
  const isLogoSearch = request.logoCandidateCount > 0;
  const isLogoSearchOnly = isLogoSearch && request.occurrenceCount === 0;
  const allLogoCandidatesRejected = isLogoSearchOnly && request.pendingLogoCandidateCount === 0 && logoCandidates.every(candidate => candidate.decision === "reject");
  const identities = new Map<number, { provider: string; externalCreatorId: string | null; externalCreatorName?: string }[]>();
  for (const binding of bindings) {
    const list = identities.get(binding.creatorId) ?? [];
    list.push({ provider: binding.provider, externalCreatorId: binding.externalCreatorId });
    identities.set(binding.creatorId, list);
  }
  for (const variant of variants) {
    if (variant.bindingId !== null) continue;
    const list = identities.get(variant.creatorId) ?? [];
    list.push({ provider: variant.provider, externalCreatorId: null, externalCreatorName: variant.externalCreatorName });
    identities.set(variant.creatorId, list);
  }
  const people = candidates.map(creator => ({ ...creator, bindings: identities.get(creator.id) ?? [] }));
  const logoUrl = profile?.imageObjectKey ? getExternalCompanyImageUrl(profile.imageObjectKey) : null;
  return <div className="grid gap-5">
    <PageHeader title={isLogoSearchOnly ? "Проверка совпадения для логотипа" : request.externalCreatorName} description={isLogoSearchOnly ? `Кандидат из TMDB: ${request.externalCreatorName}` : `${request.provider}${request.externalCreatorId ? ` #${request.externalCreatorId}` : ""} · записей: ${request.occurrenceCount}${request.roles.length ? ` · ${request.roles.join(", ")}` : ""}`} aside={<Link href="/admin/creator-requests" className={buttonVariants({ variant: "outline" })}>К заявкам</Link>} />
    {request.legacyLogoIgnore ? <section className="grid gap-3 rounded-lg border border-red-200 bg-red-50 p-4 text-sm">
      <h2 className="font-semibold">Требуется проверка прежнего общего игнора</h2>
      <p>Ранее кандидат поиска логотипа был исключён целиком. Это может блокировать будущие настоящие связи с записями. Замените общий игнор отказом только от найденных пар организаций. Только если прежний игнор был ошибкой сопоставления. Намеренный общий игнор оставьте без изменений.</p>
      <form action={repairLogoIgnoreAction}><input type="hidden" name="requestId" value={request.id} /><Button type="submit" variant="outline" disabled={request.status === "applying"}>Заменить общий игнор отклонением совпадений</Button></form>
    </section> : null}
    {logoCandidates.length ? <section className="grid gap-3"><h2 className="font-semibold">Совпадения для поиска логотипа</h2>{logoCandidates.map(candidate => <article key={candidate.creatorId} className="grid gap-3 rounded-lg border border-amber-200 bg-amber-50 p-4 text-sm">
      <h3 className="font-semibold">Для кого искали логотип</h3>
      <Link href={`/admin/creators/${candidate.creatorId}/edit`} className="font-medium underline underline-offset-4">{candidate.creatorName}</Link>
      <p>Кандидат TMDB: «{request.externalCreatorName}».</p>
      <p>Это результат поиска логотипа для организации AniList ({candidate.anilistStudioId}). Он не подтверждает реальное участие компании в записях. Проверьте, что это та же организация.</p>
      {profile?.imageStatus === "missing" ? <p className="font-medium">У кандидата нет логотипа в TMDB. Эта привязка не добавит логотип.</p> : null}
      <p>Отказ касается только этой пары организаций. Будущие настоящие связи компании TMDB с записями не блокируются.</p>
      {candidate.decision ? <p className="font-medium">{candidate.decision === "map" ? "Совпадение подтверждено." : "Совпадение отклонено: это другая организация."}</p> : request.legacyLogoIgnore ? <p>Сначала замените прежний общий игнор.</p> : <div className="flex flex-wrap gap-3">
        {request.decision !== null ? <p className="w-full">Решение по компании уже принято. Проверьте привязки на странице организации.</p> : <form action={confirmLogoCandidateAction}><input type="hidden" name="requestId" value={request.id} /><input type="hidden" name="creatorId" value={candidate.creatorId} /><Button type="submit" disabled={request.status === "applying"}>Это та же организация — подтвердить</Button></form>}
        <form action={rejectLogoCandidateAction}><input type="hidden" name="requestId" value={request.id} /><input type="hidden" name="creatorId" value={candidate.creatorId} /><Button type="submit" variant="outline" disabled={request.status === "applying"}>Это другая организация</Button></form>
      </div>}
    </article>)}</section> : null}
    {profile ? <section className="flex flex-wrap items-start gap-4 rounded-lg border border-stone-200 p-4">
      {logoUrl ? <Image src={logoUrl} alt={`Логотип ${profile.name}`} width={80} height={80} unoptimized className="size-20 bg-white object-contain" /> : null}
      <div className="min-w-0 flex-1"><h2 className="font-semibold">{profile.name}</h2>
        {profile.sourceUrl ? <a href={profile.sourceUrl} target="_blank" rel="noreferrer" className="text-sm underline underline-offset-4">Страница организации у провайдера</a> : null}
        <p className="mt-2 text-sm text-stone-500">Логотип: {profile.imageStatus === "ready" ? "сохранён" : profile.imageStatus === "missing" ? "отсутствует у провайдера" : "ожидает загрузки"}</p>
        {profile.error ? <p className="mt-2 text-sm text-red-700">{profile.error}</p> : null}
        {profile.details ? <details open={!isLogoSearch} className="mt-3 text-sm"><summary className="cursor-pointer text-stone-600">Данные источника и поиска</summary><dl className="mt-3 grid gap-2">{Object.entries(profile.details).filter(([, value]) => value !== null && value !== undefined && value !== "").map(([key, value]) => <div key={key}><dt className="text-xs text-stone-500">{PROFILE_LABELS[key] ?? key}</dt><dd className="break-words">{typeof value === "string" || typeof value === "number" ? String(value) : JSON.stringify(value)}</dd></div>)}</dl></details> : null}
      </div>
    </section> : null}
    {allLogoCandidatesRejected ? <p className="text-sm font-medium text-stone-600">Все совпадения отклонены</p> : <CreatorRequestStatus status={request.status} />}
    {request.provider === "bgg" && request.externalCreatorId ? <a href={`https://boardgamegeek.com/boardgamedesigner/${request.externalCreatorId}`} target="_blank" rel="noreferrer" className="text-sm underline">Создатель BGG #{request.externalCreatorId}</a> : null}
    {!isLogoSearchOnly ? <section className="grid gap-2"><h2 className="font-semibold">Связанные записи</h2>{entries.length ? <ul className="grid gap-2 text-sm">{entries.map(entry => <li key={`${entry.id}:${entry.roleName ?? "writer"}`}><Link href={`/admin/media/${entry.id}/edit`} className="underline underline-offset-4">{entry.title}</Link>{entry.roleName ? <span className="ml-2 text-stone-500">{entry.roleName}</span> : null}</li>)}</ul> : <p className="text-sm text-stone-500">Нет текущих связанных записей.</p>}</section> : null}
    <GenreRequestAutoRefresh enabled={request.status === "applying"} />
    <AdminToasts clearParams={["error"]} messages={[...(query.error ? [{ id: "action-error", tone: "error" as const, text: getCreatorRequestErrorMessage(query.error) }] : []), ...(request.jobError ? [{ id: "job-error", tone: "error" as const, text: request.jobError }] : [])]} />
    {request.status === "pending" && !isLogoSearchOnly ? <CreatorDecisionForm requestId={request.id} name={request.externalCreatorName} provider={request.provider} externalCreatorId={request.externalCreatorId} people={people} suggestedCreatorIds={suggestedCreatorIds} /> : null}
    {request.status === "applying" ? <p className="text-sm text-stone-500">{isLogoSearchOnly ? "Привязка организации обрабатывается. Страница обновится автоматически." : "Связи записей пересчитываются. Страница обновится автоматически."}</p> : null}
    {request.status === "failed" ? <form action={retryCreatorAction}><input type="hidden" name="requestId" value={request.id} /><Button type="submit" variant="outline">Повторить применение</Button></form> : null}
    {request.status === "processed" ? <p className="text-sm text-stone-500">{isLogoSearchOnly ? "Решение по совпадению организаций применено." : "Решение применено к записям."}</p> : null}
  </div>;
}
