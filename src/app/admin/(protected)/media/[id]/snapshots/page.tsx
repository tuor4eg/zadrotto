import { StopSnapshotRunButton } from "@/components/admin/stop-snapshot-run-button";
import Link from "next/link";
import { notFound } from "next/navigation";
import { requireAdminUser } from "@/lib/auth/admin-auth";
import { Alert } from "@/components/ui/alert";
import { getEntitySnapshotHeaders } from "@/db/queries/provider-snapshots";
import { getBookSnapshotRun } from "@/db/queries/provider-snapshot-run";
import { getCurrentBookPrimarySnapshot, getRawEntitySnapshot, getSavedBookBundle, isBookSnapshotProvider } from "@/lib/providers/book-service";
import { getSavedTmdbFilmBundle, getTmdbFilmMigrationComparison, isTmdbFilmSnapshotSupported } from "@/lib/providers/tmdb-film-service";
import { getBookMigrationComparison } from "@/lib/providers/snapshot-report";
import { bookSnapshotRunStatus } from "@/lib/providers/snapshot-run-status";
import { getMediaItemMetadata } from "@/db/queries/media-item-metadata";
import { ProviderSnapshotControls } from "@/components/admin/provider-snapshot-controls";
import { SnapshotJsonViewer } from "@/components/admin/snapshot-json-viewer";
import { SnapshotJobProgress } from "@/components/admin/snapshot-job-progress";
import { COVER_PROVIDER_LABELS } from "@/lib/covers/provider-settings";

const formatTime = (value: Date) => new Intl.DateTimeFormat("ru-RU", { timeZone: "Europe/Moscow", dateStyle: "medium", timeStyle: "short" }).format(value) + " МСК";
const roleLabel = (role: string) => role === "writer" ? "Автор" : role === "publisher" ? "Издатель" : role;
const operationLabel = { refresh: "Получение данных", process: "Применение данных", "refresh-process": "Получение и применение", verify: "Проверка переноса" };

export default async function SnapshotPage({ params, searchParams }: {
  params: Promise<{ id: string }>; searchParams: Promise<{ snapshot?: string; run?: string; error?: string; view?: string }>;
}) {
  await requireAdminUser();
  const [route, query] = await Promise.all([params, searchParams]);
  const id = Number(route.id);
  if (!Number.isSafeInteger(id) || id <= 0) notFound();
  const [headers, metadata, run] = await Promise.all([
    getEntitySnapshotHeaders({ entityType: "media-item", entityId: String(id) }),
    getMediaItemMetadata(id),
    query.run ? getBookSnapshotRun(id, Number(query.run)) : null,
  ]);
  const outcome = run ? bookSnapshotRunStatus(run) : null;
  const [primary, tmdbFilm] = await Promise.all([getCurrentBookPrimarySnapshot(id), isTmdbFilmSnapshotSupported(id)]);
  if (query.snapshot && (!Number.isSafeInteger(Number(query.snapshot)) || Number(query.snapshot) <= 0)) notFound();
  const selected = query.snapshot ? await getRawEntitySnapshot(Number(query.snapshot), id) : null;
  if (query.snapshot && !selected) notFound();
  let comparison: Awaited<ReturnType<typeof getBookMigrationComparison>> | null = null;
  let filmComparison: Awaited<ReturnType<typeof getTmdbFilmMigrationComparison>> | null = null;
  const supported = tmdbFilm || Boolean(metadata?.sourceProvider && metadata.sourceExternalId && isBookSnapshotProvider(metadata.sourceProvider));
  if (primary && !outcome?.active && metadata?.sourceProvider && metadata.sourceExternalId && isBookSnapshotProvider(metadata.sourceProvider)) {
    try {
      const bundle = await getSavedBookBundle(metadata.sourceProvider, metadata.sourceExternalId);
      comparison = await getBookMigrationComparison(id, bundle.projection);
    } catch { /* A saved primary response is not proof of a complete, applicable bundle. */ }
  }
  if (primary && !outcome?.active && tmdbFilm && metadata?.sourceExternalId) {
    try {
      const bundle = await getSavedTmdbFilmBundle(metadata.sourceExternalId);
      filmComparison = await getTmdbFilmMigrationComparison(id, bundle.projection);
    } catch { /* Incomplete snapshots cannot be applied. */ }
  }
  const summaryHref = `?view=summary${run ? `&run=${run.id}` : ""}#provider-json`;
  const fullHref = (snapshotId: number) => `?snapshot=${snapshotId}${run ? `&run=${run.id}` : ""}#provider-json`;
  return <main className="space-y-5">
    <div className="space-y-2">
      <Link className="underline text-sm" href={`/admin/media/${id}/edit`}>Вернуться к редактированию записи</Link>
      <h1 className="text-2xl font-semibold">Данные источника записи №{id}</h1>
    </div>
    {query.error === "enqueue" && <Alert variant="destructive" role="alert">Не удалось запустить задачу. Данные записи не изменены. Повторите попытку.</Alert>}
    {query.run && !run && <Alert variant="warning">Запуск не найден для этой записи. Состояние сохранённых данных показано ниже.</Alert>}
    {run && outcome?.active && <section className="rounded-md border p-4 space-y-3" aria-live="polite">
      <h2 className="font-semibold">{operationLabel[run.payload.operation]} · задача №{run.id}</h2>
      <Alert variant={outcome.success ? "success" : outcome.active ? "default" : "warning"}>{outcome.message}</Alert>
      <p className="text-sm text-stone-600">Создана: {formatTime(run.createdAt)}{run.finishedAt ? ` · Завершена: ${formatTime(run.finishedAt)}` : ""}</p>
      {run.errorMessage && <p className="text-sm text-stone-600">{run.errorMessage}</p>}
      <SnapshotJobProgress active={outcome.active} />
      {outcome.active && <StopSnapshotRunButton runId={run.id} returnTo={`/admin/media/${id}/snapshots?run=${run.id}`} />}
    </section>}
    {run && outcome && !outcome.active && !outcome.success && <Alert variant="warning" role="alert">
      {outcome.message}{run.errorMessage ? ` ${run.errorMessage}` : ""}
    </Alert>}
    <Alert variant={primary ? "success" : "default"}>
      {primary ? <><strong>Данные провайдера сохранены.</strong> {isBookSnapshotProvider(primary.providerCode) ? COVER_PROVIDER_LABELS[primary.providerCode] : primary.providerCode} · получены {formatTime(primary.fetchedAt)}.</>
        : outcome?.active ? <><strong>Данные ещё не сохранены.</strong> Получение уже запущено — дождитесь результата.</>
          : <><strong>Сохранённых данных текущего источника пока нет.</strong> Начните с «Получить данные».</>}
    </Alert>
    {!supported && <Alert variant="warning">У записи не выбран поддерживаемый источник. Сначала выберите FantLab, Google Books, Open Library или TMDB для фильма в редакторе.</Alert>}
    <ProviderSnapshotControls mediaItemId={id} provider={tmdbFilm ? "tmdb" : undefined} showActions canProcess={Boolean(comparison || filmComparison)} busy={Boolean(outcome?.active) || !supported} />
    <section id="comparison" className="space-y-3 scroll-mt-4">
      <h2 className="text-xl font-semibold">Сравнение с текущей записью</h2>
      {filmComparison ? <>
        <p className="text-sm text-stone-600">Сравнение характеристик фильма. Участники из credits не обрабатываются; ручные данные и решения модерации сохраняются.</p>
        <div className="grid gap-4 md:grid-cols-2">
          <article className="rounded-md border p-4 space-y-2"><h3 className="font-semibold">Сейчас в записи</h3><SnapshotJsonViewer value={filmComparison.current} /></article>
          <article className="rounded-md border p-4 space-y-2"><h3 className="font-semibold">В сохранённых данных провайдера</h3><SnapshotJsonViewer value={filmComparison.proposed} /></article>
        </div>
        {filmComparison.blockers.length > 0 && <Alert variant="warning">Обнаружены расхождения. Проверьте данные перед применением.</Alert>}
      </> : comparison ? <>
        <p className="text-sm text-stone-600">Справа — участники из ответа провайдера. При применении учитываются существующие сопоставления и решения модерации. Ручные назначения и псевдонимы сохраняются; для неизвестных участников создаются заявки.</p>
        <div className="grid gap-4 md:grid-cols-2">
          <article className="rounded-md border p-4 space-y-2">
            <h3 className="font-semibold">Сейчас в записи</h3>
            {comparison.contributors.length ? <ol className="space-y-2">{comparison.contributors.map(part => <li key={`${part.role}:${part.id}`}>
              <span className="text-sm text-stone-500">{roleLabel(part.role)}: </span>{part.name}{part.isManual ? <span className="text-xs text-stone-500"> · назначен вручную</span> : null}
            </li>)}</ol> : <p className="text-sm text-stone-500">Участники пока не назначены.</p>}
            {comparison.pseudonymCreatorId && <p className="text-sm">У записи назначен псевдоним — он сохранится.</p>}
          </article>
          <article className="rounded-md border p-4 space-y-2">
            <h3 className="font-semibold">В сохранённых данных провайдера</h3>
            {comparison.proposed.length ? <ol className="space-y-2">{comparison.proposed.map((part, index) => <li key={`${part.role}:${index}`}>
              <span className="text-sm text-stone-500">{roleLabel(part.role)}: </span>{part.name}
            </li>)}</ol> : <p className="text-sm text-stone-500">Участники не указаны.</p>}
          </article>
        </div>
        {comparison.blockers.length > 0 && <Alert variant="warning">В ответе провайдера отсутствуют некоторые авторы из прежних данных. Проверьте состав перед применением. Ручные назначения сохранятся.</Alert>}
      </> : <p className="text-sm text-stone-600">{outcome?.active ? "Дождитесь завершения задачи — сравнение появится автоматически." : primary ? "Основной ответ сохранён, но полный комплект не удалось подготовить. Получите данные повторно; применение пока недоступно." : "Сравнение появится после получения данных."}</p>}
    </section>
    <details id="provider-json" open={Boolean(selected) || query.view === "summary"} className="rounded-md border p-4 space-y-3 scroll-mt-4">
      <summary className="cursor-pointer font-semibold">Данные провайдера (JSON)</summary>
      {run && outcome && !outcome.active && <div className="space-y-1 pt-3 text-sm">
        <p className="font-semibold">{operationLabel[run.payload.operation]} · задача №{run.id}</p>
        <p>{outcome.message}</p>
        {run.finishedAt && <p>Завершена: {formatTime(run.finishedAt)}</p>}
      </div>}
      <div className="flex flex-wrap items-center gap-3 pt-3 text-sm">
        {selected ? <Link className="underline" href={summaryHref}>Свернуть до кратких данных</Link> : <span className="font-semibold">Краткие данные</span>}
        {selected ? <span className="font-semibold">Полные данные провайдера</span>
          : primary ? <Link className="underline" href={fullHref(primary.id)}>Развернуть полные данные провайдера</Link> : null}
      </div>
      <p className="text-sm text-stone-600">{selected
        ? "Полные сохранённые данные провайдера без сокращений. Просмотр не меняет запись."
        : tmdbFilm ? "Краткая сводка: текущие и предлагаемые характеристики фильма и расхождения." : "Краткая сводка: текущие участники записи, участники из данных провайдера и расхождения."}</p>
      {selected || comparison || filmComparison ? <SnapshotJsonViewer key={selected ? `${selected.id}:${selected.payloadHash}` : "summary"} value={selected ? selected.payload : filmComparison ?? comparison} />
        : <p className="text-sm text-stone-500">Краткие данные пока недоступны.</p>}
      {headers.length > 1 && <div className="space-y-2 text-sm">
        <p className="font-medium">Сохранённые данные по отдельным ресурсам</p>
        <ul className="space-y-2">{headers.map(row => <li key={row.id}>
          {selected?.id === row.id ? <span>{row.providerCode} · {row.resourceType} · {row.externalId} — открыто</span>
            : <Link className="underline" href={fullHref(row.id)}>{row.providerCode} · {row.resourceType} · {row.externalId} — полные данные</Link>}
        </li>)}</ul>
      </div>}
    </details>
  </main>;
}
