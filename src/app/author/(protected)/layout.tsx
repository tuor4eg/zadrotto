import Link from "next/link";

import { logoutAuthor } from "@/app/author/actions";
import { Button, buttonVariants } from "@/components/ui/button";
import { requireAuthor } from "@/lib/auth/author-auth";

export const dynamic = "force-dynamic";

type AuthorLayoutProps = {
  children: React.ReactNode;
};

export default async function AuthorLayout({ children }: AuthorLayoutProps) {
  const author = await requireAuthor();

  return (
    <main className="archive-page min-h-screen px-4 py-6 text-stone-950 sm:px-6 lg:px-10">
      <div className="mx-auto flex w-full max-w-5xl flex-col gap-6">
        <header className="flex flex-wrap items-center justify-between gap-4 border-b border-stone-400/40 pb-5">
          <div>
            <h1 className="font-serif text-4xl leading-none text-stone-50">
              Кабинет автора: {author.name}
            </h1>
          </div>

          <div className="flex flex-wrap items-center gap-2">
            <Link
              href="/author"
              className={buttonVariants({ variant: "outline", size: "sm" })}
            >
              Главная
            </Link>
            <Link
              href="/author/media"
              className={buttonVariants({ variant: "outline", size: "sm" })}
            >
              Предложения
            </Link>
            <Link
              href="/author/franchises"
              className={buttonVariants({ variant: "outline", size: "sm" })}
            >
              Серии
            </Link>
            <Link
              href="/author/reviews"
              className={buttonVariants({ variant: "outline", size: "sm" })}
            >
              Рецензии
            </Link>
            <Link
              href="/"
              className={buttonVariants({ variant: "outline", size: "sm" })}
            >
              Архив
            </Link>
            <form action={logoutAuthor}>
              <Button type="submit" variant="outline" size="sm" className="cursor-pointer">
                Выйти
              </Button>
            </form>
          </div>
        </header>

        <section
          className="archive-paper-surface archive-panel p-5 sm:p-6"
          style={{ overflow: "visible" }}
        >
          {children}
        </section>
      </div>
    </main>
  );
}
