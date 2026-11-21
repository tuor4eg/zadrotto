import Link from "next/link";
import { StopSnapshotRunButton } from "@/components/admin/stop-snapshot-run-button";
import { SnapshotJobProgress } from "@/components/admin/snapshot-job-progress";
import { Alert } from "@/components/ui/alert";
import { COVER_PROVIDER_LABELS } from "@/lib/covers/provider-settings";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { getJobRunById } from "@/db/queries/jobs";
import { CREATOR_FIELDS_FILL_JOB_TYPE, parseCreatorFieldsFillPayload } from "@/lib/creators/fields-fill-payload";

export async function getCreatorFieldsFillRun(runId: string | undefined, creatorId?: number) {
  const id = Number(runId);
  if (!Number.isSafeInteger(id) || id < 1) return null;
  const run = await getJobRunById(id);
  if (run?.type !== CREATOR_FIELDS_FILL_JOB_TYPE) return null;
  try {
    const payload = parseCreatorFieldsFillPayload(run.payload);
    if (creatorId === undefined ? payload.force : (
      !payload.force || payload.creatorIds?.length !== 1 || payload.creatorIds[0] !== creatorId
    )) return null;
    return { ...run, payload };
  } catch {
    return null;
  }
}

type CreatorFieldsFillRunData = NonNullable<Awaited<ReturnType<typeof getCreatorFieldsFillRun>>>;

const statusLabels: Record<string, string> = {
  queued: "В очереди",
  running: "Выполняется",
  succeeded: "Завершена",
  failed: "Завершена с ошибкой",
  cancelled: "Отменена",
};

export function CreatorFieldsFillRun({ run, single = false }: { run: CreatorFieldsFillRunData; single?: boolean }) {
  const active = run.status === "queued" || run.status === "running";
  const { progress } = run.payload;
  return <Card>
    <CardHeader>
      <div className="flex flex-wrap items-center justify-between gap-3">
        <CardTitle>{active ? "Ход заполнения" : "Результат заполнения"}</CardTitle>
        <Badge variant={run.status === "succeeded" ? "positive" : run.status === "failed" ? "destructive" : "outline"}>{statusLabels[run.status] ?? run.status}</Badge>
      </div>
      <CardDescription>Задача №{run.id}{run.payload.providers ? ` · ${run.payload.providers.map(provider => COVER_PROVIDER_LABELS[provider]).join(", ")}` : ""}</CardDescription>
    </CardHeader>
    <CardContent className="grid gap-3 text-sm" aria-live="polite">
      {progress && <dl className="grid grid-cols-2 gap-3 sm:grid-cols-3">
        {([
          ["Проверено создателей", progress.processed],
          ["Обновлено создателей", progress.updated],
          ["Заполнено полей", progress.filled],
          ["Создатели без части снимков", progress.missing],
          ["Требуют проверки", progress.review],
          ["Ошибки", progress.failed],
        ] as const).map(([label, value]) => <div key={label} className="rounded-md border bg-stone-50 p-3">
          <dt className="text-stone-500">{label}</dt>
          <dd className="mt-1 text-lg font-semibold">{value}</dd>
        </div>)}
      </dl>}
      {!single && progress?.details.length === 100 && <p className="text-stone-500">Показаны последние 100 результатов по создателям.</p>}
      {progress?.details.map(detail => <div key={detail.creatorId}>
        {single ? null : <Link href={`/admin/creators/${detail.creatorId}/edit`} className="font-medium underline">Создатель №{detail.creatorId}</Link>}
        <ul className="list-disc pl-5">
          {detail.messages.map((message, index) => <li key={index}>{message}</li>)}
        </ul>
      </div>)}
      {run.errorMessage && <Alert variant="warning">{run.errorMessage}</Alert>}
      <SnapshotJobProgress active={active} />
      {active && <StopSnapshotRunButton runId={run.id} returnTo={single
        ? `/admin/creators/${run.payload.creatorIds?.[0]}/edit?fillRun=${run.id}`
        : `/admin/tools/providers/snapshots?fillRun=${run.id}`} />}
      <Link className="w-fit underline" href={`/admin/tools/jobs/journal?job=adhoc#run-${run.id}`}>Подробности в журнале</Link>
    </CardContent>
  </Card>;
}
