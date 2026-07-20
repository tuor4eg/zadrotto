import { Alert } from "@/components/ui/alert";
import { Button } from "@/components/ui/button";
import { Input, Label } from "@/components/ui/form";
import { getEmailOutboxCounts, getResendEmailConfig, getResendEmailStatus } from "@/db/queries/email-provider";
import { disableEmailProviderAction, retryFailedEmailsAction, saveEmailProviderAction, testEmailProviderAction } from "./actions";

export default async function AdminEmailPage({ searchParams }: { searchParams: Promise<Record<string, string | undefined>> }) {
  const [config, status, counts, query] = await Promise.all([getResendEmailConfig(), getResendEmailStatus(), getEmailOutboxCounts(), searchParams]);
  return <section className="space-y-5"><div><h1 className="font-serif text-4xl">Email · Resend</h1><p className="text-sm text-stone-600">Настройки системных писем авторской авторизации.</p></div>
    {query.error ? <Alert variant="destructive">Операция не выполнена. Проверь настройки и ключ шифрования.</Alert> : query.saved || query.tested || query.retried !== undefined ? <Alert>{query.retried !== undefined ? `Возвращено в очередь: ${query.retried}.` : "Настройки сохранены или операция выполнена."}</Alert> : null}
    <div className="rounded-md border bg-white p-4 text-sm">Статус: {status.status === "ready" ? "готов" : status.status === "disabled" ? "выключен" : status.status === "decrypt-error" ? "ключ не расшифрован" : "не настроен"} · ключ {status.keyHint ?? "не задан"} · обновлено {status.updatedAt?.toLocaleString("ru-RU") ?? "—"} · ожидают {counts.pending} · ошибок {counts.failed}</div>
    <form action={saveEmailProviderAction} className="grid max-w-2xl gap-4 rounded-md border bg-white p-5">
      <div className="grid gap-2"><Label htmlFor="apiKey">API key</Label><Input id="apiKey" name="apiKey" type="password" placeholder={status.keyHint ?? "re_…"} /></div>
      <p className="text-xs text-stone-500">При смене `EMAIL_PROVIDER_CREDENTIALS_KEY` сохранённый API key перестанет расшифровываться. Введи Resend API key заново и сохрани настройки.</p>
      <div className="grid gap-2"><Label htmlFor="fromName">Имя отправителя</Label><Input id="fromName" name="fromName" defaultValue={config?.fromName} required /></div>
      <div className="grid gap-2"><Label htmlFor="fromEmail">Email отправителя</Label><Input id="fromEmail" name="fromEmail" type="email" defaultValue={config?.fromEmail} required /></div>
      <div className="grid gap-2"><Label htmlFor="replyTo">Reply-To</Label><Input id="replyTo" name="replyTo" type="email" defaultValue={config?.replyTo} /></div>
      <label className="flex gap-2"><input type="checkbox" name="enabled" value="1" defaultChecked={config?.enabled} /> Включить отправку</label>
      <Button type="submit">Сохранить</Button>
    </form>
    <div className="flex flex-wrap gap-2"><form action={disableEmailProviderAction}><Button type="submit" variant="outline">Выключить</Button></form><form action={testEmailProviderAction}><Button type="submit" variant="outline">Отправить тест</Button></form><form action={retryFailedEmailsAction}><Button type="submit" variant="outline">Повторить ошибочные</Button></form></div>
  </section>;
}
