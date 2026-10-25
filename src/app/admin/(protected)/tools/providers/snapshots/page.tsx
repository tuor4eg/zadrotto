import { StopSnapshotRunButton } from "@/components/admin/stop-snapshot-run-button";
import Link from "next/link";
import { SNAPSHOT_OPERATIONS_UI } from "./snapshot-operations";
import { COVER_PROVIDER_LABELS } from "@/lib/covers/provider-settings";
import { History } from "lucide-react";
import { requireAdminUser } from "@/lib/auth/admin-auth";
import { getSnapshotBatchSettings } from "@/lib/providers/snapshot-job-payload";
import { snapshotItemErrorMessage } from "@/lib/providers/snapshot-item-errors";
import { getProviderSnapshotRun } from "@/db/queries/provider-snapshot-run";
import { getCreatorNamesByIds } from "@/db/queries/creator-names";
import { creatorAdminLabel } from "@/lib/creators/admin-label";
import { creatorSnapshotDiagnosticMessage } from "@/components/admin/creator-snapshot-diagnostics";
import { SnapshotJobProgress } from "@/components/admin/snapshot-job-progress";
import { Badge } from "@/components/ui/badge";
import { Alert } from "@/components/ui/alert";
import { buttonVariants } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { ProfileTargetForm } from "./profile-target-form";
import { SnapshotBatchForm } from "./snapshot-batch-form";

export default async function ProviderSnapshotsPage({ searchParams }: { searchParams: Promise<{ error?: string; run?: string }> }) {
  await requireAdminUser();
  const query = await searchParams;
  const run = query.run ? await getProviderSnapshotRun(Number(query.run)) : null;
  const creatorNames = run?.payload.entityType === "creator" ? await getCreatorNamesByIds([
    ...(run.payload.checkpoint?.errors.map(item => item.id) ?? []),
    ...(run.payload.checkpoint?.diagnostics?.map(item => item.id) ?? []),
    ...(run.payload.creatorIds ?? []),
  ]) : {};
  const batch = run ? getSnapshotBatchSettings(run.payload) : null;
  const active = run?.status === "queued" || run?.status === "running";
  const processed = run?.payload.profileCheckpoint?.processed ?? run?.payload.checkpoint?.processed ?? 0;
  const failed = run?.payload.profileCheckpoint?.failed ?? run?.payload.checkpoint?.failed ?? 0;
  const statusLabels: Record<string, string> = { queued: "В очереди", running: "Выполняется", succeeded: "Завершена", failed: "Завершена с ошибкой", cancelled: "Отменена" };
  return <section className="grid gap-5">
    <div className="flex flex-wrap items-start justify-between gap-3">
      <div className="space-y-1">
        <h2 className="font-serif text-2xl">Снимки провайдеров</h2>
        <p className="text-sm leading-6 text-stone-600">Получение, проверка и применение сохранённых данных записей и исходных профилей создателей.</p>
      </div>
      <Link href="/admin/tools/jobs/journal?job=adhoc" className={buttonVariants({ variant: "outline", size: "sm" })}><History />Журнал запусков</Link>
    </div>
    {query.error === "invalid" && <Alert variant="destructive" role="alert">Не удалось запустить обработку. Проверьте параметры и повторите попытку.</Alert>}
    <div className="space-y-3">
      <p className="text-sm leading-6 text-stone-600">Обработка запускается вручную и проходит партиями с выбранным размером и паузой, с учётом лимитов провайдера. Для обработки одного объекта откройте «Данные источника» в его редакторе.</p>
      <ProfileTargetForm busy={active} />
      <SnapshotBatchForm key={run?.id ?? "new"} busy={active} values={run?.payload} />
      {query.run && !run && <Alert variant="warning">Запуск не найден. Его можно проверить в журнале.</Alert>}
      {run && <Card>
        <CardHeader>
          <div className="flex flex-wrap items-center justify-between gap-3">
            <CardTitle>{active ? "Ход обработки" : "Результат обработки"}</CardTitle>
            <Badge variant={run.status === "succeeded" ? "positive" : run.status === "failed" ? "destructive" : "outline"}>{statusLabels[run.status] ?? run.status}</Badge>
          </div>
          <CardDescription>Задача №{run.id} · {run.payload.profileTargets ? "Внешние профили" : run.payload.entityType === "creator" ? (run.payload.creatorIds?.length === 1 ? creatorAdminLabel(run.payload.creatorIds[0], creatorNames[run.payload.creatorIds[0]]) : "Создатели") : run.payload.mediaType === "series" ? "Сериалы" : run.payload.provider === "tmdb" || run.payload.mediaType === "film" ? "Фильмы" : "Книги"} · {run.payload.provider ? COVER_PROVIDER_LABELS[run.payload.provider] : "Все провайдеры"} · {SNAPSHOT_OPERATIONS_UI[run.payload.operation].label}. Счётчики обновляются после каждой завершённой записи.</CardDescription>
        </CardHeader>
        <CardContent className="grid gap-4" aria-live="polite">
          {batch && <p className="text-sm text-stone-600">Размер партии: {batch.batchSize}. Пауза между партиями: {batch.batchPauseHours === 0 ? "1 секунда" : `${batch.batchPauseHours} ч.`}</p>}
          {run.payload.onlyMissingSnapshots && <p className="text-sm text-stone-600">Выборка: только объекты без основного сохранённого снимка текущего источника.</p>}
          <dl className="grid gap-3 sm:grid-cols-3">
            <div className="rounded-md border border-stone-200 bg-stone-50 p-3"><dt className="text-sm text-stone-500">Пройдено записей</dt><dd className="mt-1 text-2xl font-semibold">{processed + failed}</dd></div>
            <div className="rounded-md border border-stone-200 bg-stone-50 p-3"><dt className="text-sm text-stone-500">Успешно</dt><dd className="mt-1 text-2xl font-semibold text-emerald-700">{processed}</dd></div>
            <div className="rounded-md border border-stone-200 bg-stone-50 p-3"><dt className="text-sm text-stone-500">С ошибкой</dt><dd className="mt-1 text-2xl font-semibold text-red-700">{failed}</dd></div>
          </dl>
          {active && <p className="text-sm text-stone-600">{run.status === "queued" ? "Ожидаем запуска или продолжения обработки." : "Записи обрабатываются по очереди."} Паузы между партиями и запросами учитывают лимиты провайдера.</p>}
          {run.errorMessage && <Alert variant={active ? "default" : "warning"}>{run.errorMessage}</Alert>}
          {Boolean(run.payload.checkpoint?.errors.length) && <div className="space-y-2 text-sm">
            <h3 className="font-semibold">Записи с ошибками</h3>
            <ul className="space-y-2">{run.payload.checkpoint!.errors.map((item, index) => <li key={`${item.id}:${index}`}>
              <Link className="font-medium underline" href={run.payload.entityType === "creator" ? `/admin/creators/${item.id}/edit` : `/admin/media/${item.id}/edit`}>{run.payload.entityType === "creator" ? creatorAdminLabel(item.id, creatorNames[item.id]) : `Запись №${item.id}`}</Link>: {snapshotItemErrorMessage(item)}
            </li>)}</ul>
            {failed > run.payload.checkpoint!.errors.length && <p className="text-stone-500">Показаны последние {run.payload.checkpoint!.errors.length} ошибок из {failed}.</p>}
          </div>}
          {run.payload.entityType === "creator" && Boolean(run.payload.checkpoint?.diagnostics?.length) && <div className="space-y-2 text-sm"><h3 className="font-semibold">Пропущенные данные</h3>{run.payload.checkpoint!.diagnostics!.map(item => <div key={item.id}><Link href={`/admin/creators/${item.id}/snapshots`} className="underline">{creatorAdminLabel(item.id, creatorNames[item.id])}</Link>{item.codes.map(code => <p key={code}>{creatorSnapshotDiagnosticMessage(code)}</p>)}</div>)}</div>}
          {run.payload.profileTargets && <div className="space-y-2"><h3 className="font-semibold">Исходные профили</h3>{run.payload.profileTargets.map(target => <Link key={`${target.provider}:${target.resourceType}:${target.externalId}`} className="block text-sm underline" href={`/admin/tools/providers/snapshots/profile?${new URLSearchParams(target)}`}>Посмотреть raw: {target.provider} · {target.resourceType} · {target.externalId}</Link>)}</div>}
          {run.payload.profileCheckpoint?.errors.map((item, index) => <p key={index} className="text-sm text-red-700">{item.target ? `${item.target.provider} · ${item.target.resourceType} · ${item.target.externalId}` : `Привязка №${item.bindingId ?? item.id}`}: {snapshotItemErrorMessage(item)}</p>)}
          <SnapshotJobProgress active={active} />
      {active && <StopSnapshotRunButton runId={run.id} returnTo={`/admin/tools/providers/snapshots?run=${run.id}`} />}
          {!active && run.status === "succeeded" && <p className="text-sm text-emerald-700">Обработка завершена. {processed + failed === 0 ? "Подходящих записей не найдено." : "Результат сохранён."}</p>}
          <Link className="w-fit text-sm underline" href={`/admin/tools/jobs/journal?job=adhoc#run-${run.id}`}>Подробности в журнале</Link>
        </CardContent>
      </Card>}

    </div>

  </section>;
}
