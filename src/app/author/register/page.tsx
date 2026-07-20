import Link from "next/link";
import { notFound } from "next/navigation";

import { Alert } from "@/components/ui/alert";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Input, Label } from "@/components/ui/form";
import { PasswordField } from "@/components/auth/password-field";
import { AUTHOR_LOGIN_MAX_LENGTH, AUTHOR_PASSWORD_MAX_LENGTH, AUTHOR_PASSWORD_MIN_LENGTH } from "@/lib/auth/author-account";
import { isAuthorEmailDeliveryConfigured, isAuthorRegistrationEnabled } from "@/lib/auth/features";
import { registerAuthorAction } from "./actions";
import { RegistrationStartedAtInput } from "./registration-started-at-input";

export const dynamic = "force-dynamic";

export default async function AuthorRegisterPage({ searchParams }: { searchParams: Promise<{ error?: string; sent?: string }> }) {
  if (!isAuthorRegistrationEnabled()) notFound();
  const isEmailDeliveryConfigured = await isAuthorEmailDeliveryConfigured();
  const query = await searchParams;
  return (
    <main className="archive-page min-h-screen px-4 py-8 text-stone-950">
      <Card className="archive-paper-surface mx-auto max-w-lg border-stone-500/40">
        <CardHeader><CardTitle className="font-serif text-3xl">Регистрация автора</CardTitle></CardHeader>
        <CardContent>
          {!isEmailDeliveryConfigured ? (
            <div className="grid gap-4">
              <Alert variant="destructive">
                Регистрация временно недоступна: отправка писем ещё не настроена. Попробуй позже.
              </Alert>
              <Link className="text-sm underline underline-offset-4" href="/author/login">
                Вернуться ко входу
              </Link>
            </div>
          ) : query.sent === "1" ? <Alert>Письмо с подтверждением отправлено. Если его долго нет, проверьте папку Спам.</Alert> : (
            <form action={registerAuthorAction} className="grid gap-4">
              <RegistrationStartedAtInput />
              <input className="hidden" name="website" tabIndex={-1} autoComplete="off" aria-hidden="true" />
              {query.error ? <Alert variant="destructive">Проверь заполненные поля.</Alert> : null}
              <div className="grid gap-2"><Label htmlFor="name">Имя</Label><Input id="name" name="name" required /></div>
              <div className="grid gap-2"><Label htmlFor="login">Логин</Label><Input id="login" name="login" maxLength={AUTHOR_LOGIN_MAX_LENGTH} required /></div>
              <div className="grid gap-2"><Label htmlFor="email">Email</Label><Input id="email" name="email" type="email" required /></div>
              <div className="grid gap-2"><Label htmlFor="password">Пароль</Label><PasswordField id="password" name="password" autoComplete="new-password" minLength={AUTHOR_PASSWORD_MIN_LENGTH} maxLength={AUTHOR_PASSWORD_MAX_LENGTH} required /></div>
              <div className="grid gap-2"><Label htmlFor="passwordConfirmation">Повтори пароль</Label><Input id="passwordConfirmation" name="passwordConfirmation" type="password" autoComplete="new-password" minLength={AUTHOR_PASSWORD_MIN_LENGTH} maxLength={AUTHOR_PASSWORD_MAX_LENGTH} required /></div>
              <Button type="submit">Регистрация</Button>
            </form>
          )}
        </CardContent>
      </Card>
    </main>
  );
}
