import Link from "next/link";
import { redirect } from "next/navigation";

import { Alert } from "@/components/ui/alert";
import { Button, buttonVariants } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Input, Label } from "@/components/ui/form";
import { getCurrentAuthor } from "@/lib/author-auth";
import { loginAuthor } from "./actions";

type AuthorLoginPageProps = {
  searchParams: Promise<{
    error?: string;
  }>;
};

export default async function AuthorLoginPage({ searchParams }: AuthorLoginPageProps) {
  const author = await getCurrentAuthor();

  if (author) {
    redirect("/author");
  }

  const { error } = await searchParams;
  const hasInvalidTokenError = error === "invalid";

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
          <form action={loginAuthor} className="flex flex-col gap-4" noValidate>
            <div className="flex flex-col gap-2">
              <Label htmlFor="author-access-token">
                Токен доступа
              </Label>
              <Input
                id="author-access-token"
                name="accessToken"
                type="password"
                autoComplete="off"
                required
              />
            </div>

            {hasInvalidTokenError ? (
              <Alert variant="destructive">
                Неверный токен доступа.
              </Alert>
            ) : null}

            <Button type="submit">
              Войти
            </Button>
          </form>
          </CardContent>
        </Card>
      </div>
    </main>
  );
}
