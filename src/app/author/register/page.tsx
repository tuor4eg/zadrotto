import Link from "next/link";
import { notFound } from "next/navigation";

import { Alert } from "@/components/ui/alert";
import { buttonVariants } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import {
  isAuthorEmailDeliveryConfigured,
  isAuthorEmailVerificationBypassed,
  isAuthorRegistrationEnabled,
} from "@/lib/auth/features";
import { AuthorRegistrationForm } from "./author-registration-form";

export const dynamic = "force-dynamic";

export default async function AuthorRegisterPage({ searchParams }: { searchParams: Promise<{ email?: string; registered?: string; sent?: string }> }) {
  if (!isAuthorRegistrationEnabled()) notFound();
  const bypassEmailVerification = isAuthorEmailVerificationBypassed();
  const isEmailDeliveryConfigured = bypassEmailVerification
    || await isAuthorEmailDeliveryConfigured();
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
          ) : query.registered === "1" ? (
            <Alert>
              Регистрация завершена. Теперь можно <Link className="underline underline-offset-4" href="/author/login">войти</Link>.
            </Alert>
          ) : query.sent === "1" ? (
            <div className="grid gap-4">
              <Alert>
                Письмо с подтверждением отправлено{query.email ? <> на <strong className="break-all">{query.email}</strong></> : null}.
                Если его долго нет, проверьте папку Спам.
              </Alert>
              <Link className={buttonVariants()} href="/">На сайт</Link>
            </div>
          ) : (
            <AuthorRegistrationForm />
          )}
        </CardContent>
      </Card>
    </main>
  );
}
