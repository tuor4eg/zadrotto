"use client";

import { useFormStatus } from "react-dom";
import { cancelJobRunAction } from "@/app/admin/(protected)/tools/jobs/actions";
import { Button } from "@/components/ui/button";

function StopButton() {
  const { pending } = useFormStatus();
  return <Button type="submit" variant="outline" disabled={pending}>{pending ? "Останавливаем…" : "Остановить"}</Button>;
}

export function StopSnapshotRunButton({ runId, returnTo }: { runId: number; returnTo: string }) {
  return <form action={cancelJobRunAction} className="space-y-2">
    <input type="hidden" name="id" value={runId} />
    <input type="hidden" name="returnTo" value={returnTo} />
    <StopButton />
    <p className="text-xs text-stone-500">Уже сохранённые изменения останутся.</p>
  </form>;
}
