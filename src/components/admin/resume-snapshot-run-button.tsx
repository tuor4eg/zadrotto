"use client";

import { useFormStatus } from "react-dom";
import { resumeSnapshotRunAction } from "@/app/admin/(protected)/tools/jobs/actions";
import { Button } from "@/components/ui/button";

function ResumeButton({ runId }: { runId: number }) {
  const { pending } = useFormStatus();
  return <Button type="submit" variant="outline" disabled={pending} aria-label={`Продолжить запуск ${runId} сейчас`}>
    {pending ? "Снимаем паузу…" : "Продолжить сейчас"}
  </Button>;
}

export function ResumeSnapshotRunButton({ runId, returnTo }: { runId: number; returnTo: string }) {
  return <form action={resumeSnapshotRunAction}>
    <input type="hidden" name="id" value={runId} />
    <input type="hidden" name="returnTo" value={returnTo} />
    <ResumeButton runId={runId} />
  </form>;
}
