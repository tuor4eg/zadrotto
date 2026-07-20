import { redirect } from "next/navigation";

import { Alert } from "@/components/ui/alert";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Input, Label } from "@/components/ui/form";
import { PasswordField } from "@/components/auth/password-field";
import { getAuthorAccountByAuthorId } from "@/db/queries/author-auth";
import { getCurrentAuthorSession, isFreshAccessTokenSession } from "@/lib/auth/author-auth";
import { AUTHOR_PASSWORD_MAX_LENGTH, AUTHOR_PASSWORD_MIN_LENGTH } from "@/lib/auth/author-account";
import { isAuthorEmailDeliveryConfigured } from "@/lib/auth/features";
import { onboardExistingAuthorAction, resendAuthorVerificationAction } from "./actions";

export default async function AuthorOnboardingPage({ searchParams }: { searchParams: Promise<{ error?: string; sent?: string; resent?: string; resendError?: string }> }) {
  const [current, query] = await Promise.all([getCurrentAuthorSession(), searchParams]);
  if (!current || !isFreshAccessTokenSession(current.session)) redirect("/author/login");
  const account = await getAuthorAccountByAuthorId(current.author.id);
  if (account && account.status !== "pending_email") redirect("/author");
  const isPendingEmail = account?.status === "pending_email";
  const emailDeliveryConfigured = await isAuthorEmailDeliveryConfigured();

  return (
    <main className="archive-page min-h-screen px-4 py-8 text-stone-950">
      <Card className="archive-paper-surface mx-auto max-w-lg border-stone-500/40">
        <CardHeader><CardTitle className="font-serif text-3xl">Настроить вход</CardTitle></CardHeader>
        <CardContent>
          {isPendingEmail || query.sent === "1" ? (
            <div className="grid gap-4"><Alert>{query.resent ? "Новое письмо отправлено." : query.resendError ? "Не удалось отправить письмо. Попробуй позже." : "Письмо отправлено. Перейди по ссылке, чтобы подтвердить email."}</Alert><form action={resendAuthorVerificationAction}><Button type="submit" variant="outline">Отправить письмо ещё раз</Button></form></div>
          ) : !emailDeliveryConfigured ? (
            <Alert variant="destructive">Настройка входа по паролю временно недоступна. Вход по токену продолжает работать.</Alert>
          ) : (
            <form action={onboardExistingAuthorAction} className="grid gap-4">
              {query.error ? <Alert variant="destructive">Не удалось сохранить данные. Проверь поля или попробуй позже.</Alert> : null}
              <div className="grid gap-2"><Label htmlFor="login">Логин</Label><Input id="login" name="login" required /></div>
              <div className="grid gap-2"><Label htmlFor="email">Email</Label><Input id="email" name="email" type="email" required /></div>
              <div className="grid gap-2"><Label htmlFor="password">Пароль</Label><PasswordField id="password" name="password" autoComplete="new-password" minLength={AUTHOR_PASSWORD_MIN_LENGTH} maxLength={AUTHOR_PASSWORD_MAX_LENGTH} required /></div>
              <div className="grid gap-2"><Label htmlFor="passwordConfirmation">Повтори пароль</Label><Input id="passwordConfirmation" name="passwordConfirmation" type="password" autoComplete="new-password" minLength={AUTHOR_PASSWORD_MIN_LENGTH} maxLength={AUTHOR_PASSWORD_MAX_LENGTH} required /></div>
              <Button type="submit">Сохранить и подтвердить email</Button>
            </form>
          )}
        </CardContent>
      </Card>
    </main>
  );
}
