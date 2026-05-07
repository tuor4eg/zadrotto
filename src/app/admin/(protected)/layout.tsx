import Link from "next/link";
import { Archive, FileClock, FileText, KeyRound, Layers3, LogOut, UserRound } from "lucide-react";

import { logoutAdmin } from "@/app/admin/actions";
import { buttonVariants } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { requireAdminUser } from "@/lib/admin-auth";

type AdminLayoutProps = {
  children: React.ReactNode;
};

export default async function AdminLayout({ children }: AdminLayoutProps) {
  const adminUser = await requireAdminUser();

  return (
    <main className="min-h-screen bg-[linear-gradient(180deg,#f7f4ef_0%,#f3f0ea_45%,#ece9e2_100%)] px-4 py-6 text-stone-950 sm:px-6 lg:px-10">
      <div className="mx-auto flex w-full max-w-6xl flex-col gap-5">
        <header className="flex flex-wrap items-center justify-between gap-4">
          <div>
            <p className="text-xs font-medium uppercase tracking-[0.18em] text-stone-500">
              Админка
            </p>
            <h1 className="mt-2 text-3xl font-semibold tracking-tight text-stone-950">
              Панель управления
            </h1>
          </div>

          <div className="flex flex-wrap items-center gap-2">
            <Link
              href="/admin/franchises"
              className={buttonVariants({ variant: "outline", size: "sm" })}
            >
              <Layers3 />
              Серии
            </Link>
            <Link
              href="/admin/media"
              className={buttonVariants({ variant: "outline", size: "sm" })}
            >
              <FileText />
              Записи
            </Link>
            <Link
              href="/admin/authors"
              className={buttonVariants({ variant: "outline", size: "sm" })}
            >
              <UserRound />
              Авторы
            </Link>
            <Link
              href="/admin/media-review"
              className={buttonVariants({ variant: "outline", size: "sm" })}
            >
              <FileClock />
              Заявки
            </Link>
            <Link
              href="/admin/author-tokens"
              className={buttonVariants({ variant: "outline", size: "sm" })}
            >
              <KeyRound />
              Токены
            </Link>
            <Link
              href="/"
              className={buttonVariants({ variant: "ghost", size: "sm" })}
            >
              <Archive />
              Архив
            </Link>
            <form action={logoutAdmin}>
              <button
                type="submit"
                className={buttonVariants({ variant: "ghost", size: "sm" })}
              >
                <LogOut />
                Выйти
              </button>
            </form>
          </div>
        </header>

        <Card>
          <CardContent className="p-5 sm:p-6">
          <div className="mb-5 flex items-center gap-2 border-b border-stone-100 pb-4 text-sm text-stone-500">
            <UserRound className="size-4" />
            Текущий админ: <span className="font-medium text-stone-950">{adminUser.login}</span>
          </div>
          {children}
          </CardContent>
        </Card>
      </div>
    </main>
  );
}
