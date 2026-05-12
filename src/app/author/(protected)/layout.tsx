import Link from "next/link";

import { logoutAuthor } from "@/app/author/actions";
import { requireAuthor } from "@/lib/author-auth";

type AuthorLayoutProps = {
  children: React.ReactNode;
};

export default async function AuthorLayout({ children }: AuthorLayoutProps) {
  const author = await requireAuthor();

  return (
    <main className="min-h-screen bg-zinc-100 px-4 py-6 text-zinc-950 sm:px-6 lg:px-10">
      <div className="mx-auto flex w-full max-w-5xl flex-col gap-6">
        <header className="flex flex-wrap items-center justify-between gap-4 border-b border-zinc-300 pb-5">
          <div>
            <p className="text-xs font-semibold uppercase tracking-[0.18em] text-red-700">
              Автор
            </p>
            <h1 className="mt-2 text-3xl font-semibold text-zinc-950">Кабинет автора</h1>
          </div>

          <div className="flex flex-wrap items-center gap-2">
            <Link
              href="/author/media"
              className="border border-zinc-300 bg-white px-3 py-2 text-xs font-semibold uppercase tracking-[0.16em] text-zinc-600 transition-colors hover:border-zinc-950 hover:text-zinc-950"
            >
              Моя картотека
            </Link>
            <Link
              href="/"
              className="border border-zinc-300 bg-white px-3 py-2 text-xs font-semibold uppercase tracking-[0.16em] text-zinc-600 transition-colors hover:border-zinc-950 hover:text-zinc-950"
            >
              Архив
            </Link>
            <form action={logoutAuthor}>
              <button
                type="submit"
                className="border border-zinc-300 bg-white px-3 py-2 text-xs font-semibold uppercase tracking-[0.16em] text-zinc-600 transition-colors hover:border-zinc-950 hover:text-zinc-950"
              >
                Выйти
              </button>
            </form>
          </div>
        </header>

        <section className="border border-zinc-300 bg-white p-5 sm:p-6">
          <div className="mb-5 border-b border-zinc-200 pb-4 text-sm text-zinc-500">
            Текущий автор:{" "}
            <span className="font-medium text-zinc-950">
              {author.name}
            </span>
          </div>
          {children}
        </section>
      </div>
    </main>
  );
}
