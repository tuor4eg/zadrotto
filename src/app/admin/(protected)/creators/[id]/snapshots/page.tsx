import { StopSnapshotRunButton } from "@/components/admin/stop-snapshot-run-button";
import Link from "next/link";
import { notFound } from "next/navigation";
import { requireAdminUser } from "@/lib/auth/admin-auth";
import { getCreatorSnapshotComparison } from "@/db/queries/creator-provider-snapshots";
import { getCreatorSnapshotRun } from "@/db/queries/provider-snapshot-run";
import { ProviderSnapshotControls } from "@/components/admin/provider-snapshot-controls";
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
  const [comparison, run] = await Promise.all([
    getCreatorSnapshotComparison(id),
    query.run ? getCreatorSnapshotRun(id, Number(query.run)) : null,
  ]);
  if (!comparison) notFound();
  const { state, snapshot, projection, changes, diagnostics } = comparison;
  const active = run?.status === "queued" || run?.status === "running";
  const success = run?.status === "succeeded" && run.payload.checkpoint?.processed === 1 && run.payload.checkpoint.failed === 0;
  const labels: Record<string, string> = { queued: "В очереди", running: "Выполняется", succeeded: "Завершена", failed: "Завершена с ошибкой", cancelled: "Отменена" };
  const baseQuery = run ? `run=${run.id}&` : "";
  return <main className="space-y-5">
    <Link href={`/admin/creators/${id}/edit`} className="text-sm underline">Редактировать: {state.name}</Link>
    <h1 className="text-2xl font-semibold">Данные FantLab: {creatorAdminLabel(id, state.name)}</h1>
    {query.error === "enqueue" && <Alert variant="destructive">Не удалось запустить задачу. Проверьте привязку и повторите попытку.</Alert>}
    {query.run && !run && <Alert variant="warning">Запуск не найден для этого создателя.</Alert>}
    {run && <section className="space-y-3 rounded-md border p-4" aria-live="polite">
      <h2 className="font-semibold">{SNAPSHOT_OPERATIONS_UI[run.payload.operation].label} · задача №{run.id}</h2>
      <Alert variant={success ? "success" : active ? "default" : "warning"}>{run.status === "succeeded" && !success ? "Обработка завершена с пропусками или ошибкой" : labels[run.status] ?? run.status}</Alert>
      {run.errorMessage && <p className="text-sm">{run.errorMessage}</p>}
      {run.payload.checkpoint?.errors.map((error, index) => <p key={index} className="text-sm text-red-700">{snapshotItemErrorMessage(error)}</p>)}
      {run.payload.checkpoint?.diagnostics?.map(item => <div key={item.id} className="text-sm">{item.codes.map(code => <p key={code}>{creatorSnapshotDiagnosticMessage(code)}</p>)}</div>)}
      <SnapshotJobProgress active={active} />
      {active && <StopSnapshotRunButton runId={run.id} returnTo={`/admin/creators/${id}/snapshots?run=${run.id}`} />}
      <Link className="text-sm underline" href={`/admin/tools/jobs/journal?job=adhoc#run-${run.id}`}>Подробности в журнале</Link>
    </section>}
    {state.bindings.length !== 1 && <Alert variant="warning">Для обработки нужна единственная подтверждённая привязка FantLab. Проверьте привязки в редакторе.</Alert>}
    <Alert variant={snapshot ? "success" : "default"}>{snapshot ? "Полный ответ FantLab сохранён, включая биографию и награды." : "Сохранённых данных текущего источника пока нет."}</Alert>
    <ProviderSnapshotControls creatorId={id} showActions canProcess={Boolean(projection)} busy={active || state.bindings.length !== 1} />
    <section id="comparison" className="scroll-mt-4 space-y-3">
      <h2 className="text-xl font-semibold">Сравнение дат жизни</h2>
      <p className="text-sm text-stone-600">Применяются только полные даты для людей без исходящей связи псевдонима. Заполненные значения сохраняются. Имена и другие данные создателя не меняются.</p>
      <div className="grid gap-4 sm:grid-cols-2">
        {([{ key: "birthDate", label: "Дата рождения" }, { key: "deathDate", label: "Дата смерти" }] as const).map(({ key, label }) => <article key={key} className="space-y-2 rounded-md border p-4">
          <h3 className="font-semibold">{label}</h3>
          <p className="text-sm">Сейчас: {state[key] ?? "не указана"}</p>
          <p className="text-sm">В снимке: {projection?.[key] ?? "нет корректной полной даты"}</p>
          <p className="text-sm text-stone-600">{changes[key] ? `Будет заполнена: ${changes[key]}` : "Изменений не будет"}</p>
        </article>)}
      </div>
      {diagnostics.length > 0 && <Alert variant="warning"><ul>{diagnostics.map((message, index) => <li key={index}>{creatorSnapshotDiagnosticMessage(message)}</li>)}</ul></Alert>}
    </section>
    <details open={Boolean(query.view)} className="space-y-3 rounded-md border p-4" id="provider-json">
      <summary className="cursor-pointer font-semibold">Данные провайдера (JSON)</summary>
      <div className="flex flex-wrap gap-3 text-sm"><Link href={`?${baseQuery}view=summary#provider-json`} className="underline">Краткие данные</Link>{snapshot && <Link href={`?${baseQuery}view=full#provider-json`} className="underline">Полный ответ</Link>}</div>
      <SnapshotJsonViewer key={`${snapshot?.payloadHash ?? "empty"}:${query.view ?? "summary"}`} value={query.view === "full" && snapshot ? snapshot.payload : { projection, changes, diagnostics }} />
    </details>
  </main>;
}
