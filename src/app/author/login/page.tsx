import Link from "next/link";
import { redirect } from "next/navigation";

import { buttonVariants } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { getCurrentAuthor } from "@/lib/auth/author-auth";
import { AuthorLoginForm } from "./author-login-form";

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
            <AuthorLoginForm initialError={initialError} redirectOnSuccess />
          </CardContent>
        </Card>
      </div>
    </main>
  );
}
