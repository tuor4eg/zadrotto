import Link from "next/link";
import { redirect } from "next/navigation";

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
    <main className="min-h-screen bg-zinc-100 px-4 py-6 text-zinc-950 sm:px-6 lg:px-10">
      <div className="mx-auto flex min-h-[calc(100vh-3rem)] w-full max-w-sm flex-col justify-center gap-6">
        <Link
          href="/"
          className="w-fit border border-zinc-300 bg-white px-3 py-2 text-xs font-semibold uppercase tracking-[0.16em] text-zinc-600 transition-colors hover:border-zinc-950 hover:text-zinc-950"
        >
          К архиву
        </Link>

        <section className="border border-zinc-300 bg-white p-5 sm:p-6">
          <div className="mb-5">
            <p className="text-xs font-semibold uppercase tracking-[0.18em] text-red-700">
              Автор
            </p>
            <h1 className="mt-2 text-3xl font-semibold leading-tight text-zinc-950">Вход</h1>
          </div>

          <form action={loginAuthor} className="flex flex-col gap-4">
            <div className="flex flex-col gap-2">
              <label
                htmlFor="author-access-token"
                className="text-[10px] font-semibold uppercase tracking-[0.16em] text-zinc-400"
              >
                Токен доступа
              </label>
              <input
                id="author-access-token"
                name="accessToken"
                type="password"
                autoComplete="off"
                required
                className="h-10 border border-zinc-300 bg-white px-3 text-sm text-zinc-950 outline-none focus:border-zinc-950"
              />
            </div>

            {hasInvalidTokenError ? (
              <p className="border border-red-200 bg-red-50 px-3 py-2 text-sm text-red-700">
                Неверный токен доступа.
              </p>
            ) : null}

            <button
              type="submit"
              className="h-10 border border-zinc-950 bg-zinc-950 px-3 text-xs font-semibold uppercase tracking-[0.16em] text-white transition-colors hover:bg-white hover:text-zinc-950"
            >
              Войти
            </button>
          </form>
        </section>
      </div>
    </main>
  );
}
