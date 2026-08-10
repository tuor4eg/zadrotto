import { PasswordField } from "@/components/auth/password-field";
import { Alert } from "@/components/ui/alert";
import { Button } from "@/components/ui/button";
import { Input, Label } from "@/components/ui/form";
import { getAuthorProfileAccountState } from "@/db/queries/author-auth";
import { AUTHOR_PASSWORD_MAX_LENGTH, AUTHOR_PASSWORD_MIN_LENGTH } from "@/lib/auth/author-account";
import { getCurrentAuthorSession } from "@/lib/auth/author-auth";
import { AUTHOR_DISPLAY_NAME_MAX_LENGTH } from "@/lib/authors/display-name";
import {
  isAuthorEmailDeliveryConfigured,
  isAuthorEmailVerificationBypassed,
} from "@/lib/auth/features";
import { changeAuthorEmailAction, changeAuthorPasswordAction, logoutAuthorToTokenLogin, resendAuthorVerificationAction, updateAuthorDiscoverabilityAction, updateAuthorDisplayNameAction } from "./actions";
import { AuthorOnboardingForm } from "./author-onboarding-form";
import { AvatarEditor } from "./avatar-editor";
import { AuthorToasts, type AuthorToast } from "../author-toasts";

type ProfileQuery = {
  avatarError?: string;
  avatarRemoved?: string;
  avatarUpdated?: string;
  displayNameError?: string;
  displayNameUpdated?: string;
  discoverabilityError?: string;
  discoverabilityUpdated?: string;
  error?: string;
  resent?: string;
  resendError?: string;
  sent?: string;
  updated?: string;
  verified?: string;
};

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
  const avatarEditor = (
    <AvatarEditor
      authorName={current.author.name}
      avatarObjectKey={current.author.avatarObjectKey}
    />
  );
  const displayNameForm = (
    <form action={updateAuthorDisplayNameAction} className="grid gap-2 rounded-md border p-4">
      <div>
        <h3 className="font-semibold">Отображаемое имя</h3>
        <p className="mt-1 text-sm text-stone-600">
          Это имя видно в кабинете, рецензиях и списках авторов.
        </p>
      </div>
      <Label htmlFor="displayName">Имя</Label>
      <Input
        id="displayName"
        name="displayName"
        defaultValue={current.author.name}
        maxLength={AUTHOR_DISPLAY_NAME_MAX_LENGTH}
        required
      />
      <Button type="submit" className="justify-self-start">Сохранить имя</Button>
    </form>
  );
  const avatarToast: AuthorToast | null = query.avatarUpdated
    ? { id: "avatar-updated", tone: "success", text: "Аватар обновлён." }
    : query.avatarRemoved
      ? { id: "avatar-removed", tone: "success", text: "Аватар удалён." }
      : query.avatarError
        ? {
            id: "avatar-error",
            tone: "error",
            text: query.avatarError === "avatar-too-large"
              ? "Файл аватара больше 5 МБ."
              : query.avatarError === "avatar-image"
                ? "Не удалось прочитать изображение."
                : query.avatarError === "avatar-crop"
                  ? "Область кадрирования некорректна."
                  : "Не удалось сохранить аватар.",
          }
        : null;
  const avatarToasts = (
    <AuthorToasts
      clearParams={["avatarError", "avatarRemoved", "avatarUpdated"]}
      messages={avatarToast ? [avatarToast] : []}
    />
  );
  const displayNameToast: AuthorToast | null = query.displayNameUpdated
    ? { id: "display-name-updated", tone: "success", text: "Отображаемое имя изменено." }
    : query.displayNameError
      ? { id: "display-name-error", tone: "error", text: "Не удалось изменить имя. Укажи от 1 до 80 символов." }
      : null;
  const displayNameToasts = (
    <AuthorToasts
      clearParams={["displayNameError", "displayNameUpdated"]}
      messages={displayNameToast ? [displayNameToast] : []}
    />
  );
  const discoverabilityToast: AuthorToast | null = query.discoverabilityUpdated
    ? { id: "discoverability-updated", tone: "success", text: "Настройка видимости сохранена." }
    : query.discoverabilityError
      ? { id: "discoverability-error", tone: "error", text: "Не удалось сохранить настройку видимости." }
      : null;
  const profileIdentitySettings = (
    <>
      {avatarEditor}
      {displayNameForm}
      <AuthorToasts
        clearParams={["discoverabilityError", "discoverabilityUpdated"]}
        messages={discoverabilityToast ? [discoverabilityToast] : []}
      />
      <form action={updateAuthorDiscoverabilityAction} className="grid gap-3 rounded-md border p-4">
        <div>
          <h3 className="font-semibold">Поиск пользователей</h3>
          <p className="mt-1 text-sm text-stone-600">
            Если отключить настройку, профиль останется доступен вам и существующим друзьям.
          </p>
        </div>
        <label className="flex items-center gap-3 text-sm text-stone-800">
          <input
            type="checkbox"
            name="isDiscoverable"
            value="1"
            defaultChecked={current.author.isDiscoverable}
            className="size-4 rounded border-stone-300"
          />
          Показывать меня в поиске пользователей
        </label>
        <Button type="submit" variant="outline" className="justify-self-start">Сохранить видимость</Button>
      </form>
    </>
  );

  if (!account?.status) {
    return <div className="max-w-2xl space-y-5"><h2 className="font-serif text-3xl">Общие</h2><p className="text-stone-600">Настрой вход по логину, email и паролю.</p>
      {avatarToasts}
      {displayNameToasts}
      {profileIdentitySettings}
      {!isAccessTokenSession ? <TokenReloginPrompt /> : !emailDeliveryConfigured ? <Alert variant="destructive">Настройка входа временно недоступна: отправка писем не настроена.</Alert> : <AuthorOnboardingForm bypassEmailVerification={bypassEmailVerification} />}
    </div>;
  }

  if (account.status === "pending_email") {
    const toast: AuthorToast | null = query.resent
      ? { id: "resent", tone: "success", text: "Новое письмо отправлено." }
      : query.resendError
        ? { id: "resend-error", tone: "error", text: "Не удалось отправить письмо. Попробуй позже." }
        : null;
    return <div className="max-w-2xl space-y-5"><h2 className="font-serif text-3xl">Общие</h2>
      <AuthorToasts clearParams={["resent", "resendError"]} messages={toast ? [toast] : []} />
      {avatarToasts}
      {displayNameToasts}
      <Alert>Подтверди email по ссылке из письма.</Alert>
      <div className="rounded-md border p-5"><p className="font-medium">Ожидает подтверждения</p><p className="mt-1 text-sm text-stone-600">Email: {account.primaryEmail ?? "—"}</p></div>
      {profileIdentitySettings}
      {!isAccessTokenSession ? <TokenReloginPrompt /> : <form action={resendAuthorVerificationAction}><Button type="submit" variant="outline" disabled={!emailDeliveryConfigured}>Отправить письмо ещё раз</Button></form>}
    </div>;
  }

  if (account.status !== "active") {
    return <div className="max-w-2xl space-y-5"><h2 className="font-serif text-3xl">Общие</h2>{avatarToasts}{displayNameToasts}{profileIdentitySettings}<Alert variant="destructive">Аккаунт недоступен. Войди заново или обратись к администратору.</Alert></div>;
  }

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
  return <div className="max-w-3xl space-y-5"><h2 className="font-serif text-3xl">Общие</h2>
    {avatarToasts}
    {displayNameToasts}
    <AuthorToasts clearParams={["error", "updated", "verified"]} messages={toast ? [toast] : []} />
    {profileIdentitySettings}
    <div className="grid items-end gap-4 rounded-md border p-5 sm:grid-cols-2">
      <div className="grid gap-1"><p className="text-xs text-stone-500">Логин</p><p className="font-medium">{account.login ?? "—"}</p></div>
      <div className="grid gap-1"><p className="text-xs text-stone-500">Основной email</p><p className="font-medium">{account.primaryEmail ?? "—"}</p></div>
    </div>
    <div className="grid gap-4 md:grid-cols-2">
      <form action={changeAuthorPasswordAction} className="grid grid-rows-[auto_auto_auto_auto_minmax(0,1fr)_auto] items-start gap-2 rounded-md border p-4"><h2 className="font-semibold">Сменить пароль</h2><input className="sr-only" name="username" autoComplete="username" value={account.login ?? ""} tabIndex={-1} aria-hidden="true" readOnly /><Label htmlFor="currentPasswordForPassword">Текущий пароль</Label><Input id="currentPasswordForPassword" name="currentPassword" type="password" autoComplete="current-password" required /><Label htmlFor="newPassword">Новый пароль</Label><PasswordField id="newPassword" name="password" autoComplete="new-password" minLength={AUTHOR_PASSWORD_MIN_LENGTH} maxLength={AUTHOR_PASSWORD_MAX_LENGTH} required /><Button type="submit">Сохранить</Button></form>
      <form action={changeAuthorEmailAction} className="grid grid-rows-[auto_auto_auto_auto_minmax(0,1fr)_auto] items-start gap-2 rounded-md border p-4"><h2 className="font-semibold">Сменить email</h2><input className="sr-only" name="username" autoComplete="username" value={account.login ?? ""} tabIndex={-1} aria-hidden="true" readOnly /><Label htmlFor="newEmail">Новый email</Label><Input id="newEmail" name="email" type="email" autoComplete="email" required /><Label htmlFor="currentPasswordForEmail">Текущий пароль</Label><Input id="currentPasswordForEmail" name="currentPassword" type="password" autoComplete="current-password" required /><Button type="submit">Отправить ссылку</Button></form>
    </div>
  </div>;
}
