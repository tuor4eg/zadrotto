import { ActivityLogTime } from "@/app/admin/(protected)/tools/activity/activity-log-time";
import { PasswordField } from "@/components/auth/password-field";
import { Alert } from "@/components/ui/alert";
import { Button } from "@/components/ui/button";
import { Input, Label } from "@/components/ui/form";
import { getAuthorProfileAccountState, getAuthorSessions } from "@/db/queries/author-auth";
import { AUTHOR_PASSWORD_MAX_LENGTH, AUTHOR_PASSWORD_MIN_LENGTH } from "@/lib/auth/author-account";
import { getCurrentAuthorSession } from "@/lib/auth/author-auth";
import {
  isAuthorEmailDeliveryConfigured,
  isAuthorEmailVerificationBypassed,
} from "@/lib/auth/features";
import { changeAuthorEmailAction, changeAuthorPasswordAction, logoutAuthorToTokenLogin, resendAuthorVerificationAction, revokeAuthorSessionAction } from "./actions";
import { AuthorOnboardingForm } from "./author-onboarding-form";
import { AuthorToasts, type AuthorToast } from "../author-toasts";

type ProfileQuery = { error?: string; resent?: string; resendError?: string; sent?: string; updated?: string; verified?: string };

function TokenReloginPrompt() {
  return <Alert variant="destructive"><div className="space-y-3"><p>Для настройки входа нужно войти по токену доступа.</p><form action={logoutAuthorToTokenLogin}><Button type="submit" variant="outline">Войти заново по токену</Button></form></div></Alert>;
}

export default async function AuthorProfilePage({ searchParams }: { searchParams: Promise<ProfileQuery> }) {
  const current = await getCurrentAuthorSession();
  if (!current) return null;
  const bypassEmailVerification = isAuthorEmailVerificationBypassed();
  const [account, query, emailDeliveryConfigured] = await Promise.all([
    getAuthorProfileAccountState(current.author.id),
    searchParams,
    bypassEmailVerification
      ? Promise.resolve(true)
      : isAuthorEmailDeliveryConfigured(),
  ]);
  const isAccessTokenSession = current.session.authMethod === "access_token";

  if (!account?.status) {
    return <div className="mx-auto max-w-2xl space-y-5"><h1 className="font-serif text-4xl">Профиль</h1><p className="text-stone-600">Настрой вход по логину, email и паролю.</p>
      {!isAccessTokenSession ? <TokenReloginPrompt /> : !emailDeliveryConfigured ? <Alert variant="destructive">Настройка входа временно недоступна: отправка писем не настроена.</Alert> : <AuthorOnboardingForm bypassEmailVerification={bypassEmailVerification} />}
    </div>;
  }

  if (account.status === "pending_email") {
    const toast: AuthorToast | null = query.resent
      ? { id: "resent", tone: "success", text: "Новое письмо отправлено." }
      : query.resendError
        ? { id: "resend-error", tone: "error", text: "Не удалось отправить письмо. Попробуй позже." }
        : null;
    return <div className="mx-auto max-w-2xl space-y-5"><h1 className="font-serif text-4xl">Профиль</h1>
      <AuthorToasts clearParams={["resent", "resendError"]} messages={toast ? [toast] : []} />
      <Alert>Подтверди email по ссылке из письма.</Alert>
      <div className="rounded-md border p-5"><p className="font-medium">Ожидает подтверждения</p><p className="mt-1 text-sm text-stone-600">Email: {account.primaryEmail ?? "—"}</p></div>
      {!isAccessTokenSession ? <TokenReloginPrompt /> : <form action={resendAuthorVerificationAction}><Button type="submit" variant="outline" disabled={!emailDeliveryConfigured}>Отправить письмо ещё раз</Button></form>}
    </div>;
  }

  if (account.status !== "active") {
    return <div className="mx-auto max-w-2xl space-y-5"><h1 className="font-serif text-4xl">Профиль</h1><Alert variant="destructive">Аккаунт недоступен. Войди заново или обратись к администратору.</Alert></div>;
  }

  const sessions = await getAuthorSessions(current.author.id);
  const toast: AuthorToast | null = query.verified
    ? { id: "verified", tone: "success", text: "Email подтверждён. Аккаунт активен." }
    : query.error
      ? { id: "profile-error", tone: "error", text: "Не удалось сохранить изменения. Проверь данные или попробуй позже." }
      : query.updated
        ? {
            id: `updated-${query.updated}`,
            tone: "success",
            text: query.updated === "email-pending"
              ? "На новый email отправлена ссылка для подтверждения."
              : "Изменения сохранены.",
          }
        : null;
  return <div className="mx-auto max-w-3xl space-y-5"><h1 className="font-serif text-4xl">Профиль</h1>
    <AuthorToasts clearParams={["error", "updated", "verified"]} messages={toast ? [toast] : []} />
    <div className="grid items-end gap-4 rounded-md border p-5 sm:grid-cols-2">
      <div className="grid gap-1"><p className="text-xs text-stone-500">Логин</p><p className="font-medium">{account.login ?? "—"}</p></div>
      <div className="grid gap-1"><p className="text-xs text-stone-500">Основной email</p><p className="font-medium">{account.primaryEmail ?? "—"}</p></div>
    </div>
    <div className="grid gap-4 md:grid-cols-2">
      <form action={changeAuthorPasswordAction} className="grid grid-rows-[auto_auto_auto_auto_minmax(0,1fr)_auto] items-start gap-2 rounded-md border p-4"><h2 className="font-semibold">Сменить пароль</h2><input className="sr-only" name="username" autoComplete="username" value={account.login ?? ""} tabIndex={-1} aria-hidden="true" readOnly /><Label htmlFor="currentPasswordForPassword">Текущий пароль</Label><Input id="currentPasswordForPassword" name="currentPassword" type="password" autoComplete="current-password" required /><Label htmlFor="newPassword">Новый пароль</Label><PasswordField id="newPassword" name="password" autoComplete="new-password" minLength={AUTHOR_PASSWORD_MIN_LENGTH} maxLength={AUTHOR_PASSWORD_MAX_LENGTH} required /><Button type="submit">Сохранить</Button></form>
      <form action={changeAuthorEmailAction} className="grid grid-rows-[auto_auto_auto_auto_minmax(0,1fr)_auto] items-start gap-2 rounded-md border p-4"><h2 className="font-semibold">Сменить email</h2><input className="sr-only" name="username" autoComplete="username" value={account.login ?? ""} tabIndex={-1} aria-hidden="true" readOnly /><Label htmlFor="newEmail">Новый email</Label><Input id="newEmail" name="email" type="email" autoComplete="email" required /><Label htmlFor="currentPasswordForEmail">Текущий пароль</Label><Input id="currentPasswordForEmail" name="currentPassword" type="password" autoComplete="current-password" required /><Button type="submit">Отправить ссылку</Button></form>
    </div>
    <div className="flex flex-wrap gap-2"><form action={revokeAuthorSessionAction}><input type="hidden" name="intent" value="others" /><Button type="submit" variant="outline">Завершить остальные сессии</Button></form><form action={revokeAuthorSessionAction}><input type="hidden" name="intent" value="all" /><Button type="submit" variant="destructive">Выйти везде</Button></form></div>
    <div className="grid gap-3">{sessions.map((session) => <div key={session.id} className="archive-paper-surface flex items-center justify-between gap-4 rounded-md border p-4"><div><p className="font-medium">{session.id === current.session.sessionId ? "Текущая сессия" : "Сессия"}</p><p className="text-xs text-stone-500">{session.authMethod} · <ActivityLogTime value={session.lastSeenAt.toISOString()} /></p></div><form action={revokeAuthorSessionAction}><input type="hidden" name="sessionId" value={session.id} /><Button type="submit" size="sm" variant="outline">Завершить</Button></form></div>)}</div>
  </div>;
}
