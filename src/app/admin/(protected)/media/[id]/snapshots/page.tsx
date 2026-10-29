import { getSavedComicVineBundle, isComicVineSnapshotSupported } from "@/lib/providers/comic-vine-service";
import { getSavedBggBundle, getBggMigrationComparison, isBggSnapshotSupported } from "@/lib/providers/bgg-service";
import { getSavedRobloxBundle, isRobloxSnapshotSupported } from "@/lib/providers/roblox-service";
import { bggSnapshotDiagnosticMessage, gameSnapshotDiagnosticMessage } from "@/lib/providers/snapshot-item-errors";
import { getSavedGameBundle, getGameMigrationComparison, isGameSnapshotSupported } from "@/lib/providers/game-service";
import { getSavedAniListCreatorSnapshot, getAniListCreatorMigrationComparison, isAniListCreatorSnapshotSupported } from "@/lib/providers/anilist-creators-service";
import { getSavedTmdbSeriesBundle, getTmdbSeriesMigrationComparison, isTmdbSeriesSnapshotSupported } from "@/lib/providers/tmdb-series-service";
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
import { SnapshotDifferences } from "@/components/admin/snapshot-differences";
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
  const [savedPrimary, tmdbFilm, tmdbSeries, anime, game, boardgame, comic, roblox] = await Promise.all([getCurrentBookPrimarySnapshot(id), isTmdbFilmSnapshotSupported(id), isTmdbSeriesSnapshotSupported(id), isAniListCreatorSnapshotSupported(id), isGameSnapshotSupported(id), isBggSnapshotSupported(id), isComicVineSnapshotSupported(id), isRobloxSnapshotSupported(id)]);
  let animeSnapshot: Awaited<ReturnType<typeof getSavedAniListCreatorSnapshot>> = null;
  if (anime && metadata?.sourceProvider && metadata.sourceExternalId) {
    try { animeSnapshot = await getSavedAniListCreatorSnapshot(metadata.sourceProvider, metadata.sourceExternalId); }
    catch { /* Only complete snapshots for the current exact source can be applied. */ }
  }
  let gameBundle: Awaited<ReturnType<typeof getSavedGameBundle>> | null = null;
  if (game && (metadata?.sourceProvider === "igdb" || metadata?.sourceProvider === "rawg") && metadata.sourceExternalId) {
    try { gameBundle = await getSavedGameBundle(metadata.sourceProvider, metadata.sourceExternalId); }
    catch { /* Incomplete game responses cannot be applied. */ }
  }
  let bggBundle: Awaited<ReturnType<typeof getSavedBggBundle>> | null = null;
  if (boardgame && metadata?.sourceExternalId) {
    try { bggBundle = await getSavedBggBundle(metadata.sourceExternalId); }
    catch { /* Only a complete response can be transferred. */ }
  }
  let comicBundle: Awaited<ReturnType<typeof getSavedComicVineBundle>> | null = null;
  if (comic && metadata?.sourceExternalId) {
    try { comicBundle = await getSavedComicVineBundle(id, metadata.sourceExternalId); }
    catch { /* Only linked, complete evidence for the current source is usable. */ }
  }
  let robloxBundle: Awaited<ReturnType<typeof getSavedRobloxBundle>> | null = null;
  if (roblox && metadata?.sourceExternalId) {
    try { robloxBundle = await getSavedRobloxBundle(metadata.sourceExternalId); }
    catch { /* An incomplete snapshot cannot be processed. */ }
  }
  const primary = roblox ? robloxBundle?.primary ?? null : comic ? comicBundle?.primary ?? null : boardgame ? bggBundle?.primary ?? null : game ? gameBundle?.primary ?? null : anime ? animeSnapshot : savedPrimary;
  if (query.snapshot && (!Number.isSafeInteger(Number(query.snapshot)) || Number(query.snapshot) <= 0)) notFound();
  const selected = query.snapshot ? primary?.id === Number(query.snapshot) ? primary : await getRawEntitySnapshot(Number(query.snapshot), id) : null;
  if (query.snapshot && !selected) notFound();
  let comparison: Awaited<ReturnType<typeof getBookMigrationComparison>> | null = null;
  let filmComparison: Awaited<ReturnType<typeof getTmdbFilmMigrationComparison>> | null = null;
  let bggComparison: Awaited<ReturnType<typeof getBggMigrationComparison>> | null = null;
  let gameComparison: Awaited<ReturnType<typeof getGameMigrationComparison>> | null = null;
  let animeComparison: Awaited<ReturnType<typeof getAniListCreatorMigrationComparison>> | null = null;
  const supported = roblox || comic || boardgame || game || anime || tmdbFilm || tmdbSeries || Boolean(metadata?.sourceProvider && metadata.sourceExternalId && isBookSnapshotProvider(metadata.sourceProvider));
  if (primary && !outcome?.active && metadata?.sourceProvider && metadata.sourceExternalId && isBookSnapshotProvider(metadata.sourceProvider)) {
    try {
      const bundle = await getSavedBookBundle(metadata.sourceProvider, metadata.sourceExternalId);
      comparison = await getBookMigrationComparison(id, bundle.projection);
    } catch { /* A saved primary response is not proof of a complete, applicable bundle. */ }
  }
  if (primary && !outcome?.active && (tmdbFilm || tmdbSeries) && metadata?.sourceExternalId) {
    try {
      if (tmdbSeries) {
        const bundle = await getSavedTmdbSeriesBundle(metadata.sourceExternalId);
        filmComparison = await getTmdbSeriesMigrationComparison(id, bundle.projection);
      } else {
        const bundle = await getSavedTmdbFilmBundle(metadata.sourceExternalId);
        filmComparison = await getTmdbFilmMigrationComparison(id, bundle.projection);
      }
    } catch { /* Incomplete snapshots cannot be applied. */ }
  }
  if (animeSnapshot && !outcome?.active) {
    animeComparison = await getAniListCreatorMigrationComparison(id, animeSnapshot);
  }
  if (gameBundle && !outcome?.active) gameComparison = await getGameMigrationComparison(id, gameBundle.projection);
  if (bggBundle && !outcome?.active) bggComparison = await getBggMigrationComparison(id, bggBundle.projection);
  const metadataComparison = bggComparison ?? gameComparison ?? filmComparison;
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
    {run && outcome?.success && <Alert variant="success" role="status">{outcome.message}</Alert>}
    {run && ["game", "boardgame"].includes(run.payload.mediaType ?? "") && Boolean(run.payload.checkpoint?.diagnostics?.length) && <section className="space-y-2 rounded-md border border-amber-200 bg-amber-50 p-4 text-sm">
      <h2 className="font-semibold">Расхождения при переносе</h2>
      <p>Связи записи сохранены. Проверьте данные перед включением применения изменений.</p>
      <ul className="list-disc space-y-1 pl-5">{run.payload.checkpoint!.diagnostics!.filter(item => item.id === id).flatMap(item => item.codes).map(code => <li key={code}>{run.payload.mediaType === "boardgame" ? bggSnapshotDiagnosticMessage(code) : gameSnapshotDiagnosticMessage(code)}</li>)}</ul>
    </section>}
    <Alert variant={primary ? "success" : "default"}>
      {primary ? <><strong>Данные провайдера сохранены.</strong> {primary.providerCode === "anilist" ? COVER_PROVIDER_LABELS.anilist : isBookSnapshotProvider(primary.providerCode) ? COVER_PROVIDER_LABELS[primary.providerCode] : primary.providerCode} · получены {formatTime(primary.fetchedAt)}.</>
        : outcome?.active ? <><strong>Данные ещё не сохранены.</strong> Получение уже запущено — дождитесь результата.</>
          : <><strong>Сохранённых данных текущего источника пока нет.</strong> Начните с «Получить данные».</>}
    </Alert>
    {!supported && <Alert variant="warning">У записи не выбран поддерживаемый источник. Сначала выберите FantLab, Google Books, Open Library, TMDB для фильма или сериала, AniList/Jikan для аниме либо IGDB/RAWG для видеоигры или BGG для настольной игры в редакторе.</Alert>}
    {comicBundle && !comicBundle.issue && <Alert variant="warning">Данные первого выпуска отсутствуют. Существующие создатели выпуска сохранятся; повторите получение данных.</Alert>}
    <ProviderSnapshotControls mediaItemId={id} provider={roblox ? "roblox" : comic ? "comic-vine" : boardgame ? "bgg" : game ? metadata?.sourceProvider as "igdb" | "rawg" : anime ? "anilist" : tmdbFilm || tmdbSeries ? "tmdb" : undefined} mediaType={roblox ? "roblox" : comic ? "comic" : boardgame ? "boardgame" : game ? "game" : anime ? "anime" : tmdbSeries ? "series" : tmdbFilm ? "film" : "book"} showActions canProcess={Boolean(robloxBundle || comicBundle || comparison || filmComparison || animeComparison || gameComparison || bggComparison)} busy={Boolean(outcome?.active) || !supported} />
    <section id="comparison" className="space-y-3 scroll-mt-4">
      <h2 className="text-xl font-semibold">Сравнение с текущей записью</h2>
      {animeComparison ? <>
        <p className="text-sm text-stone-600">Сравнение режиссёров, производственных компаний и продюсеров AniList. Ручные назначения сохраняются; остальные характеристики записи не меняются.</p>
        <div className="grid gap-4 md:grid-cols-2">
          <article className="rounded-md border p-4 space-y-2"><h3 className="font-semibold">Сейчас в записи</h3><SnapshotJsonViewer value={animeComparison.current} /></article>
          <article className="rounded-md border p-4 space-y-2"><h3 className="font-semibold">В сохранённых данных AniList</h3><SnapshotJsonViewer value={animeComparison.proposed} /></article>
        </div>
        {animeComparison.blockers.length > 0 && <Alert variant="warning">Состав участников отличается. Проверьте данные перед применением.</Alert>}
        <SnapshotDifferences current={animeComparison.current} proposed={animeComparison.proposed} />
      </> : metadataComparison ? <>
        <p className="text-sm text-stone-600">Сравнение характеристик записи. Ручные данные и решения модерации сохраняются.{bggComparison ? " Исходные названия BGG могут отличаться от наших. Применение использует соответствия жанров; неизвестные значения попадают в заявки." : ""}</p>
        <div className="grid gap-4 md:grid-cols-2">
          <article className="rounded-md border p-4 space-y-2"><h3 className="font-semibold">Сейчас в записи</h3><SnapshotJsonViewer value={metadataComparison.current} /></article>
          <article className="rounded-md border p-4 space-y-2"><h3 className="font-semibold">В сохранённых данных провайдера</h3><SnapshotJsonViewer value={metadataComparison.proposed} /></article>
        </div>
        {metadataComparison.blockers.length > 0 && <Alert variant="warning">Обнаружены расхождения. Проверьте данные перед применением.</Alert>}
        <SnapshotDifferences current={bggComparison?.preview.current ?? gameComparison?.preview.current ?? metadataComparison.current} proposed={bggComparison?.preview.proposed ?? gameComparison?.preview.proposed ?? metadataComparison.proposed}
          proposedLabel={bggComparison || gameComparison ? "С учётом наших соответствий" : undefined}
          description={bggComparison ? "Сопоставленные жанры, состав BGG и характеристики. Служебные поля скрыты; уже существующие заявки не считаются новыми. Неизвестные жанры требуют отдельного решения в заявках." : gameComparison ? "Сопоставленные жанры, платформы и компании. Служебные поля скрыты; существующие заявки не считаются новыми. Значения без соответствий требуют отдельного решения в заявках." : undefined} />
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
        <SnapshotDifferences current={comparison.contributors.map(part => ({role:part.role,name:part.name}))} proposed={comparison.proposed.map(part => ({role:part.role,name:part.name}))} />
      </> : <p className="text-sm text-stone-600">{outcome?.active ? "Дождитесь завершения задачи — сравнение появится автоматически." : primary ? "Основной ответ сохранён, но полный комплект не удалось подготовить. Получите данные повторно; применение пока недоступно." : "Сравнение появится после получения данных."}</p>}
    </section>
    <details id="provider-json" open={Boolean(selected) || query.view === "summary"} className="rounded-md border p-4 space-y-3 scroll-mt-4">
      <summary className="cursor-pointer font-semibold">Данные провайдера ({boardgame ? "XML" : "JSON"})</summary>
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
        : boardgame || game || tmdbFilm || tmdbSeries ? "Краткая сводка: текущие и предлагаемые характеристики записи и расхождения." : "Краткая сводка: текущие участники записи, участники из данных провайдера и расхождения."}</p>
      {selected || comparison || filmComparison || animeComparison || gameComparison || bggComparison ? <SnapshotJsonViewer key={selected ? `${selected.id}:${selected.payloadHash}` : "summary"} value={selected ? selected.payload : bggComparison ?? gameComparison ?? animeComparison ?? filmComparison ?? comparison} />
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
