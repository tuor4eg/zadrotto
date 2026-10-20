"use client";

import { useActionState } from "react";
import { Badge } from "@/components/ui/badge";
import { Alert } from "@/components/ui/alert";
import { Button } from "@/components/ui/button";
import { enableBookProviderAction, type BookCutoverState } from "./actions";

const ISSUE_LABELS: Record<string, string> = {
  INVALID_SOURCE_ID: "Некорректный ID источника",
  PRIMARY_SNAPSHOT_MISSING: "Нет основного снимка",
  UNMIGRATED_LEGACY_FIELD: "Поле ещё не перенесено",
  ORIGINAL_LANGUAGE_NOT_TRANSFERRED: "Не перенесён язык оригинала",
  CONTRIBUTOR_POSITION_MISSING: "Не сохранён порядок участников",
  INVALID_LEGACY_FIELD: "Некорректные прежние данные",
  UNMATCHED_LEGACY_CONTRIBUTOR: "Не сопоставлен участник",
  UNMATCHED_LEGACY_AUTHOR_ID: "Не сопоставлен ID автора",
};

export function BookCutoverForm({ provider, label, enabled }: { provider: string; label: string; enabled: boolean }) {
  const [state, action, pending] = useActionState<BookCutoverState, FormData>(enableBookProviderAction, {});
  const active = enabled || state.enabled;
  return <section className="flex min-w-0 flex-col gap-3 rounded-md border border-stone-200 bg-stone-50/60 p-4">
    <div className="flex flex-wrap items-center justify-between gap-2"><h3 className="font-semibold">{label}</h3><Badge variant={active ? "positive" : "outline"}>{active ? "Включено" : "Ожидает перехода"}</Badge></div>
    <p className="text-sm leading-6 text-stone-600">{active ? "Записи используют нормализованные данные и связи." : "Записи пока используют прежние метаданные."}</p>
    {!active && <form action={action} className="mt-auto">
      <input type="hidden" name="provider" value={provider} />
      <Button type="submit" variant="outline" className="w-full" disabled={pending}>{pending ? "Проверка данных…" : "Проверить и включить"}</Button>
    </form>}
    {state.error && <Alert role="alert" variant="destructive">{state.error}</Alert>}
    {state.report && <div className="space-y-2 text-sm">
      <p>Проверено записей: {state.report.books}. Расхождений: {state.report.issueCount}.</p>
      <ul className="space-y-2">{state.report.issues.map((issue, index) => <li key={`${issue.mediaItemId}:${index}`}>
        <a className="underline" href={`/admin/media/${issue.mediaItemId}/snapshots`}>Запись №{issue.mediaItemId}</a>: {ISSUE_LABELS[issue.code] ?? issue.code}{issue.field ? ` (${issue.field})` : ""}
      </li>)}</ul>
      {state.report.issueCount > state.report.issues.length && <p>Показаны первые {state.report.issues.length} расхождений.</p>}
    </div>}
  </section>;
}
