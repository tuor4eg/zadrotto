import { getCreatorProfileSources } from "@/db/queries/creator-profile-snapshots";
import { enqueueProviderSnapshotAction, attachCreatorProfileSnapshotAction } from "../../../tools/providers/snapshots/actions";
import { isCoverProviderCode } from "@/lib/covers/types";
import { COVER_PROVIDER_LABELS } from "@/lib/covers/provider-settings";
import { Button } from "@/components/ui/button";
import { StopSnapshotRunButton } from "@/components/admin/stop-snapshot-run-button";
import Link from "next/link";
import { notFound } from "next/navigation";
import { requireAdminUser } from "@/lib/auth/admin-auth";
import { getCreatorSnapshotComparison } from "@/db/queries/creator-provider-snapshots";
import { getCreatorSnapshotRun } from "@/db/queries/provider-snapshot-run";
import { refreshCreatorImageAction, findAnimeCompanyLogoAction } from "../../avatar-actions";
import { SnapshotJobProgress } from "@/components/admin/snapshot-job-progress";
import { SnapshotJsonViewer } from "@/components/admin/snapshot-json-viewer";
import { snapshotItemErrorMessage } from "@/lib/providers/snapshot-item-errors";
import { creatorSnapshotDiagnosticMessage } from "@/components/admin/creator-snapshot-diagnostics";
import { Alert } from "@/components/ui/alert";
import { creatorAdminLabel } from "@/lib/creators/admin-label";
import { SNAPSHOT_OPERATIONS_UI } from "../../../tools/providers/snapshots/snapshot-operations";

export default async function CreatorSnapshotsPage({ params, searchParams }: {
  params: Promise<{ id: string }>;
  searchParams: Promise<{ run?: string; error?: string; view?: string }>;
}) {
  await requireAdminUser();
  const [{ id: rawId }, query] = await Promise.all([params, searchParams]);
  const id = Number(rawId);
  if (!Number.isSafeInteger(id) || id <= 0) notFound();
  const [comparison, sourcesState, run, tmdbComparison] = await Promise.all([
    getCreatorSnapshotComparison(id),
    getCreatorProfileSources(id),
    query.run ? getCreatorSnapshotRun(id, Number(query.run)) : null,
    getCreatorSnapshotComparison(id, "tmdb"),
  ]);
  if (!comparison || !sourcesState) notFound();
  const { state } = comparison;
  const active = run?.status === "queued" || run?.status === "running";
  const success = run?.status === "succeeded" && (run.payload.profileCheckpoint?.failed ?? run.payload.checkpoint?.failed ?? 0) === 0;
  const labels: Record<string, string> = { queued: "В очереди", running: "Выполняется", succeeded: "Завершена", failed: "Завершена с ошибкой", cancelled: "Отменена" };
  return <main className="space-y-5">
    <Link href={`/admin/creators/${id}/edit`} className="text-sm underline">Редактировать: {state.name}</Link>
    <h1 className="text-2xl font-semibold">Данные источников: {creatorAdminLabel(id, state.name)}</h1>
    {query.error === "enqueue" && <Alert variant="destructive">Не удалось запустить задачу. Проверьте привязку и повторите попытку.</Alert>}
    {query.run && !run && <Alert variant="warning">Запуск не найден для этого создателя.</Alert>}
    {run && <section className="space-y-3 rounded-md border p-4" aria-live="polite">
      <h2 className="font-semibold">{SNAPSHOT_OPERATIONS_UI[run.payload.operation].label} · задача №{run.id}</h2>
      <Alert variant={success ? "success" : active ? "default" : "warning"}>{run.status === "succeeded" && !success ? "Обработка завершена с пропусками или ошибкой" : labels[run.status] ?? run.status}</Alert>
      {run.errorMessage && <p className="text-sm">{run.errorMessage}</p>}
      {run.payload.profileCheckpoint?.errors.map((error, index) => <p key={`profile-${index}`} className="text-sm text-red-700">{snapshotItemErrorMessage(error)}</p>)}
      {run.payload.checkpoint?.errors.map((error, index) => <p key={index} className="text-sm text-red-700">{snapshotItemErrorMessage(error)}</p>)}
      {run.payload.checkpoint?.diagnostics?.map(item => <div key={item.id} className="text-sm">{item.codes.map(code => <p key={code}>{creatorSnapshotDiagnosticMessage(code)}</p>)}</div>)}
      <SnapshotJobProgress active={active} />
      {active && <StopSnapshotRunButton runId={run.id} returnTo={`/admin/creators/${id}/snapshots?run=${run.id}`} />}
      <Link className="text-sm underline" href={`/admin/tools/jobs/journal?job=adhoc#run-${run.id}`}>Подробности в журнале</Link>
    </section>}
    <p className="text-sm text-stone-600">Получение raw сохраняет полный ответ и связывает его с создателем. Имена, аватары, даты и рабочие связи не изменяются.</p>
    {query.error === "attach" && <Alert variant="destructive">Не удалось связать снимок: проверьте актуальность привязки и сохранённых данных.</Alert>}
    {!sourcesState.sources.length && <Alert>Подтверждённых источников нет. Добавьте внешнюю привязку в редакторе.</Alert>}
    {sourcesState.sources.map(source => {
      const dateComparison = source.target?.provider === "fantlab" ? comparison
        : source.target?.provider === "tmdb" && source.target.resourceType === "person" ? tmdbComparison : null;
      const canApplyDates = source.canApply && dateComparison?.state.typeCode === "person";
      const canRefreshImage = (state.typeCode === "person" && (source.target?.provider === "fantlab" || source.target?.resourceType === "person"))
        || (state.typeCode === "organization" && (source.target?.resourceType === "company" || source.target?.resourceType === "network"));
      return <section key={source.binding.id} className="space-y-3 rounded-md border p-4">
        <h2 className="font-semibold">{isCoverProviderCode(source.binding.provider) ? COVER_PROVIDER_LABELS[source.binding.provider] : source.binding.provider} · {source.binding.externalCreatorId}</h2>
        {!source.target && state.typeCode === "organization" && source.binding.provider === "anilist" && source.binding.externalCreatorId.startsWith("studio:") ? <div className="space-y-2"><p className="text-sm text-stone-600">AniList не предоставляет логотипы студий. Поиск в TMDB автоматически подтвердит единственное точное совпадение названия; спорные совпадения появятся в заявках создателей. Существующее изображение сохраняется.</p><form action={findAnimeCompanyLogoAction}><input type="hidden" name="creatorId" value={id} /><Button disabled={active} variant="outline">Найти логотип в TMDB</Button></form></div> : !source.target ? <Alert variant="warning">Получение профиля этого источника пока не поддерживается.</Alert> : <>
          <p className="text-sm">{source.snapshot ? `Снимок сохранён ${source.snapshot.fetchedAt.toLocaleString("ru-RU", { timeZone: "Europe/Moscow" })} · ${source.linked ? "связан с создателем" : "ещё не связан с создателем"}` : "Сохранённого полного профиля пока нет."}</p>
          <form action={enqueueProviderSnapshotAction}>
            <input type="hidden" name="entityType" value="creator" /><input type="hidden" name="creatorId" value={id} /><input type="hidden" name="bindingId" value={source.binding.id} /><input type="hidden" name="operation" value="refresh" />
            <Button disabled={active} type="submit">{source.snapshot ? "Обновить raw" : "Получить raw"}</Button>
          </form>
          {source.snapshot && <>
            {!source.linked && <form action={attachCreatorProfileSnapshotAction}><input type="hidden" name="creatorId" value={id} /><input type="hidden" name="bindingId" value={source.binding.id} /><input type="hidden" name="snapshotId" value={source.snapshot.id} /><input type="hidden" name="payloadHash" value={source.snapshot.payloadHash} /><Button disabled={active} variant="outline">Связать с Creator</Button></form>}
            {canApplyDates && dateComparison && <>
              <details className="space-y-3 rounded-md border p-3" id={`comparison-${source.binding.id}`}>
                <summary className="cursor-pointer font-medium">Сравнить даты жизни</summary>
                <p className="text-sm text-stone-600">Применяются только полные корректные даты для людей без исходящей связи псевдонима. Заполненные даты, имена и другие данные сохраняются.</p>
                <div className="grid gap-3 sm:grid-cols-2">{([{ key: "birthDate", label: "Дата рождения" }, { key: "deathDate", label: "Дата смерти" }] as const).map(({ key, label }) => <article key={key} className="rounded-md border p-3 text-sm"><h3 className="font-semibold">{label}</h3><p>Сейчас: {dateComparison.state[key] ?? "не указана"}</p><p>В снимке: {dateComparison.projection?.[key] ?? "нет корректной полной даты"}</p><p>{dateComparison.changes[key] ? `Будет заполнена: ${dateComparison.changes[key]}` : "Изменений не будет"}</p></article>)}</div>
                {dateComparison.diagnostics.length > 0 && <Alert variant="warning"><ul>{dateComparison.diagnostics.map((code, index) => <li key={index}>{creatorSnapshotDiagnosticMessage(code)}</li>)}</ul></Alert>}
                <details className="rounded-md border p-3"><summary className="cursor-pointer font-medium">Краткие данные сравнения (JSON)</summary><SnapshotJsonViewer value={{ projection: dateComparison.projection, changes: dateComparison.changes, diagnostics: dateComparison.diagnostics }} /></details>
              </details>
              <form action={enqueueProviderSnapshotAction}><input type="hidden" name="entityType" value="creator" /><input type="hidden" name="creatorId" value={id} /><input type="hidden" name="provider" value={source.target.provider} /><input type="hidden" name="operation" value="process" /><Button disabled={active || !dateComparison.projection} variant="positive">Применить даты из raw</Button></form>
              <details className="text-sm"><summary className="cursor-pointer">Дополнительные действия с датами</summary><form action={enqueueProviderSnapshotAction} className="pt-3"><input type="hidden" name="entityType" value="creator" /><input type="hidden" name="creatorId" value={id} /><input type="hidden" name="provider" value={source.target.provider} /><input type="hidden" name="operation" value="refresh-process" /><Button disabled={active} variant="outline">Получить и сразу применить даты</Button></form></details>
            </>}
            <details className="rounded-md border p-3"><summary className="cursor-pointer font-medium">Посмотреть полный ответ</summary><SnapshotJsonViewer value={source.snapshot.payload} /></details>
          </>}
          {canRefreshImage && <div className="space-y-2">
            <p className="text-sm text-stone-600">Обновление изображения запрашивает свежий профиль источника, затем загружает актуальное изображение отдельной задачей. Ручное изображение и изображение другого источника сохраняются.</p>
            <form action={refreshCreatorImageAction}><input type="hidden" name="creatorId" value={id} /><input type="hidden" name="bindingId" value={source.binding.id} /><Button disabled={active} variant="outline">Обновить изображение из источника</Button></form>
          </div>}
        </>}
      </section>;
    })}
  </main>;
}
