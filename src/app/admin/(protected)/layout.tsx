import Link from "next/link";
import {
  Archive,
  House,
  LogOut,
  UserRound,
} from "lucide-react";

import { logoutAdmin } from "@/app/admin/actions";
import { buttonVariants } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { getSubmittedContributionReviewCountForAdmin } from "@/db/queries/contribution-reviews";
import { getSubmittedAuthorMediaItemsCountForAdmin } from "@/db/queries/media-items";
import { requireAdminUser } from "@/lib/auth/admin-auth";
import {
  AdminAuthorsMenu,
  AdminContentMenu,
  AdminMaterialsMenu,
  AdminMobileNavMenu,
  AdminRequestsMenu,
  AdminToolsMenu,
} from "./admin-nav-menu";
import { AdminProgressBar } from "./admin-progress-bar";

type AdminLayoutProps = {
  children: React.ReactNode;
};

export const dynamic = "force-dynamic";

export default async function AdminLayout({ children }: AdminLayoutProps) {
  const [adminUser, submittedMediaItemsCount, submittedReviewsCount] = await Promise.all([
    requireAdminUser(),
    getSubmittedAuthorMediaItemsCountForAdmin(),
    getSubmittedContributionReviewCountForAdmin(),
  ]);
  return (
    <main className="min-h-screen bg-[linear-gradient(180deg,#f7f4ef_0%,#f3f0ea_45%,#ece9e2_100%)] px-4 py-6 text-stone-950 sm:px-6 lg:px-10">
      <AdminProgressBar />
      <div className="mx-auto flex w-full max-w-6xl flex-col gap-5">
        <header className="flex flex-wrap items-center justify-between gap-4">
          <div className="pl-12 md:pl-0">
            <h1 className="text-3xl font-semibold tracking-tight text-stone-950">
              Панель управления
            </h1>
          </div>

          <AdminMobileNavMenu
            submittedMediaItemsCount={submittedMediaItemsCount}
            submittedReviewsCount={submittedReviewsCount}
            logoutSlot={
              <form action={logoutAdmin}>
                <button
                  type="submit"
                  className="flex w-full items-center gap-2 rounded-md px-3 py-2 text-sm font-medium text-stone-700 transition-colors hover:bg-stone-100 hover:text-stone-950"
                >
                  <LogOut className="size-4" />
                  Выйти
                </button>
              </form>
            }
          />

          <div className="hidden flex-wrap items-center gap-2 md:flex">
            <Link
              href="/admin"
              className={buttonVariants({ variant: "outline", size: "sm" })}
            >
              <House />
              Главная
            </Link>
            <AdminContentMenu />
            <AdminMaterialsMenu />
            <AdminAuthorsMenu />
            <AdminRequestsMenu
              submittedMediaItemsCount={submittedMediaItemsCount}
              submittedReviewsCount={submittedReviewsCount}
            />
            <AdminToolsMenu />
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
