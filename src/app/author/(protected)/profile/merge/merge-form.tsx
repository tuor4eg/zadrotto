"use client";

import Link from "next/link";
import { useActionState, type ReactNode } from "react";
import { Alert } from "@/components/ui/alert";
import { Button, buttonVariants } from "@/components/ui/button";
import { confirmAccountMergeAction } from "./actions";

export function PrimaryAccountSelector({ grantId, children }: { grantId: string; children: ReactNode }) {
  return <form action="/author/profile/merge" method="get" className="space-y-4" onChange={(event) => event.currentTarget.requestSubmit()}>
    <input type="hidden" name="grant" value={grantId} />
    {children}
    <noscript><Button type="submit" variant="outline">Обновить предпросмотр</Button></noscript>
  </form>;
}

export function MergeForm({ grantId, primaryAuthorId, version }: { grantId: string; primaryAuthorId: number; version: string }) {
  const [error, action, pending] = useActionState(confirmAccountMergeAction, null);
  const message = error === "stale"
    ? "Данные аккаунтов изменились. Обнови предпросмотр и проверь результат ещё раз."
    : error === "expired"
      ? "Срок подтверждения истёк. Начни объединение заново."
      : error === "session-changed"
        ? "Сессия изменилась. Начни объединение заново в текущем аккаунте."
        : "Не удалось объединить аккаунты. Попробуй позже.";
  const incidentId = error?.match(/^unavailable:([0-9a-f-]{36})$/)?.[1];
  return <form action={action} className="space-y-4">
    <input type="hidden" name="grant" value={grantId} />
    <input type="hidden" name="primary" value={primaryAuthorId} />
    <input type="hidden" name="version" value={version} />
    {error ? <Alert variant="destructive"><p>{message}</p>{incidentId ? <p className="mt-2 break-all text-xs">Код обращения: {incidentId}</p> : null}{error === "stale" ? <Link className="mt-2 inline-block underline" href={`/author/profile/merge?grant=${encodeURIComponent(grantId)}&primary=${primaryAuthorId}`}>Обновить предпросмотр</Link> : null}</Alert> : null}
    <div className="flex flex-wrap gap-3">
      <Button type="submit" disabled={pending || Boolean(error)}>{pending ? "Объединяем…" : "Подтвердить объединение"}</Button>
      <Link href="/author/profile" className={buttonVariants({ variant: "outline" })}>Отмена</Link>
    </div>
  </form>;
}
