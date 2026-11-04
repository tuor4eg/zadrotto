import Link from "next/link";
import { redirect } from "next/navigation";

import { Alert } from "@/components/ui/alert";
import { buttonVariants } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { getCurrentAuthorSession } from "@/lib/auth/author-auth";
import { AuthorLoginForm } from "./author-login-form";

type AuthorLoginPageProps = {
  searchParams: Promise<{
    error?: string;
    externalError?: string;
    externalUnlinked?: string;
  }>;
};

export default async function AuthorLoginPage({ searchParams }: AuthorLoginPageProps) {
  const author = await getCurrentAuthorSession();

  if (author) {
    redirect("/author/profile");
  }

  const { error, externalError, externalUnlinked } = await searchParams;
  const initialError =
    error === "invalid" || error === "rate-limit" || error === "rate-limit-unavailable"
      ? error
      : null;

  return (
    <main className="archive-page min-h-screen px-4 py-6 text-stone-950 sm:px-6 lg:px-10">
      <div className="mx-auto flex min-h-[calc(100vh-3rem)] w-full max-w-sm flex-col justify-center gap-6">
        <Link
          href="/"
          className={buttonVariants({ variant: "outline", size: "sm", className: "w-fit" })}
        >
          К архиву
        </Link>

        <Card className="archive-paper-surface border-stone-500/40">
          <CardHeader>
            <p className="font-mono text-xs font-semibold uppercase tracking-[0.18em] text-red-900">
              Автор
            </p>
            <CardTitle className="font-serif text-3xl leading-none">Вход</CardTitle>
          </CardHeader>

          <CardContent>
            {externalError ? <Alert variant="destructive" className="mb-4">{externalError === "cancelled" ? "Вход через внешний сервис отменён." : "Не удалось завершить внешний вход. Попробуй ещё раз или выбери другой способ."}</Alert> : null}
            {externalUnlinked ? <Alert className="mb-4">Способ входа отключён, текущая сессия завершена. Войди другим способом.</Alert> : null}
            <AuthorLoginForm initialError={initialError} redirectOnSuccess />
          </CardContent>
        </Card>
      </div>
    </main>
  );
}
