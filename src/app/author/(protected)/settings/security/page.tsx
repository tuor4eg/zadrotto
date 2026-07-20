import { Button } from "@/components/ui/button";
import { Alert } from "@/components/ui/alert";
import { PasswordField } from "@/components/auth/password-field";
import { Label } from "@/components/ui/form";
import { AUTHOR_PASSWORD_MAX_LENGTH, AUTHOR_PASSWORD_MIN_LENGTH } from "@/lib/auth/author-account";
import { getAuthorSessions } from "@/db/queries/author-auth";
import { getCurrentAuthorSession } from "@/lib/auth/author-auth";
import { revokeAuthorSessionAction } from "./actions";
import { changeAuthorEmailAction, changeAuthorLoginAction, changeAuthorPasswordAction } from "./actions";

export default async function AuthorSecurityPage({ searchParams }: { searchParams: Promise<{ error?: string; updated?: string }> }) {
  const current = await getCurrentAuthorSession();
  if (!current) return null;
  const [sessions, query] = await Promise.all([getAuthorSessions(current.author.id), searchParams]);
  return <div className="mx-auto max-w-3xl space-y-5">
    <h1 className="font-serif text-4xl">Безопасность</h1>
    {query.error ? <Alert variant="destructive">Не удалось сохранить изменения. Проверь данные или попробуй позже.</Alert> : null}
    {query.updated ? <Alert>{query.updated === "email-pending" ? "Письмо для подтверждения нового email отправлено." : "Изменения сохранены."}</Alert> : null}
    <div className="grid gap-4 md:grid-cols-3">
      <form action={changeAuthorPasswordAction} className="grid gap-2 rounded-md border p-4"><h2 className="font-semibold">Сменить пароль</h2><Label htmlFor="currentPassword">Текущий пароль</Label><input id="currentPassword" className="rounded border p-2" name="currentPassword" type="password" autoComplete="current-password" required /><Label htmlFor="newPassword">Новый пароль</Label><PasswordField id="newPassword" name="password" autoComplete="new-password" minLength={AUTHOR_PASSWORD_MIN_LENGTH} maxLength={AUTHOR_PASSWORD_MAX_LENGTH} required /><Button type="submit">Сохранить</Button></form>
      <form action={changeAuthorLoginAction} className="grid gap-2 rounded-md border p-4"><h2 className="font-semibold">Сменить логин</h2><input className="rounded border p-2" name="login" placeholder="Новый логин" required /><input className="rounded border p-2" name="currentPassword" type="password" placeholder="Текущий пароль" required /><Button type="submit">Сохранить</Button></form>
      <form action={changeAuthorEmailAction} className="grid gap-2 rounded-md border p-4"><h2 className="font-semibold">Сменить email</h2><input className="rounded border p-2" name="email" type="email" placeholder="Новый email" required /><input className="rounded border p-2" name="currentPassword" type="password" placeholder="Текущий пароль" required /><Button type="submit">Отправить подтверждение</Button></form>
    </div>
    <div className="flex flex-wrap gap-2">
      <form action={revokeAuthorSessionAction}><input type="hidden" name="intent" value="others" /><Button type="submit" variant="outline">Завершить остальные сессии</Button></form>
      <form action={revokeAuthorSessionAction}><input type="hidden" name="intent" value="all" /><Button type="submit" variant="destructive">Выйти везде</Button></form>
    </div>
    <div className="grid gap-3">
      {sessions.map((session) => <div key={session.id} className="archive-paper-surface flex items-center justify-between gap-4 rounded-md border p-4">
        <div><p className="font-medium">{session.id === current.session.sessionId ? "Текущая сессия" : "Сессия"}</p><p className="text-xs text-stone-500">{session.authMethod} · {session.lastSeenAt.toLocaleString("ru-RU")}</p></div>
        <form action={revokeAuthorSessionAction}><input type="hidden" name="sessionId" value={session.id} /><Button type="submit" size="sm" variant="outline">Завершить</Button></form>
      </div>)}
    </div>
  </div>;
}
