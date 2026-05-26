import Link from "next/link";
import {
  Archive,
  FileClock,
  House,
  LogOut,
  Settings,
  UserRound,
} from "lucide-react";

import { logoutAdmin } from "@/app/admin/actions";
import { buttonVariants } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { getSubmittedAuthorMediaItemsCountForAdmin } from "@/db/queries/media-items";
import { requireAdminUser } from "@/lib/admin-auth";
import { AdminAuthorsMenu, AdminContentMenu } from "./admin-nav-menu";
import { AdminProgressBar } from "./admin-progress-bar";

type AdminLayoutProps = {
  children: React.ReactNode;
};

export const dynamic = "force-dynamic";

export default async function AdminLayout({ children }: AdminLayoutProps) {
  const [adminUser, submittedMediaItemsCount] = await Promise.all([
    requireAdminUser(),
    getSubmittedAuthorMediaItemsCountForAdmin(),
  ]);
  const visibleSubmittedMediaItemsCount =
    submittedMediaItemsCount > 99 ? "99+" : String(submittedMediaItemsCount);

  return (
    <main className="min-h-screen bg-[linear-gradient(180deg,#f7f4ef_0%,#f3f0ea_45%,#ece9e2_100%)] px-4 py-6 text-stone-950 sm:px-6 lg:px-10">
      <AdminProgressBar />
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
              href="/admin"
              className={buttonVariants({ variant: "outline", size: "sm" })}
            >
              <House />
              Главная
            </Link>
            <AdminContentMenu />
            <AdminAuthorsMenu />
            <Link
              href="/admin/media-review"
              className={`${buttonVariants({ variant: "outline", size: "sm" })} relative`}
            >
              <FileClock />
              Заявки
              {submittedMediaItemsCount > 0 ? (
                <span
                  aria-label={`${submittedMediaItemsCount} заявок на модерацию`}
                  className="absolute -right-2 -top-2 grid h-5 min-w-5 place-items-center rounded-full bg-red-600 px-1.5 text-[11px] font-semibold leading-none text-white shadow-sm"
                >
                  {visibleSubmittedMediaItemsCount}
                </span>
              ) : null}
            </Link>
            <Link
              href="/admin/settings"
              className={buttonVariants({ variant: "outline", size: "sm" })}
            >
              <Settings />
              Настройки
            </Link>
            <Link
              href="/"
              className={buttonVariants({ variant: "outline", size: "sm" })}
            >
              <Archive />
              Архив
            </Link>
            <form action={logoutAdmin}>
              <button
                type="submit"
                className={buttonVariants({ variant: "outline", size: "sm" })}
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
