import Link from "next/link";

import { logoutAuthor } from "@/app/author/actions";
import { Button, buttonVariants } from "@/components/ui/button";
import { requireAuthor } from "@/lib/auth/author-auth";
import { getIncomingFriendRequestCount } from "@/db/queries/friends";
import { NotificationBadge } from "@/components/ui/notification-badge";
import { PublicSiteHeader } from "@/components/archive/public-site-header";
import { getPublicSiteHeaderState } from "@/lib/archive/public-site-header";
import { AuthorMobileNavMenu } from "./author-mobile-nav-menu";
import { AuthorProposalsMenu } from "./author-proposals-menu";

export const dynamic = "force-dynamic";

type AuthorLayoutProps = {
  children: React.ReactNode;
};

export default async function AuthorLayout({ children }: AuthorLayoutProps) {
  const author = await requireAuthor();
  const [incomingFriendRequestCount, headerState] = await Promise.all([
    getIncomingFriendRequestCount(author.id),
    getPublicSiteHeaderState(author),
  ]);

  return (
    <main className="archive-page min-h-screen min-w-0 px-3 pb-3 pt-3 text-stone-950 sm:px-5 sm:pb-5 lg:px-7 lg:pb-7">
      <div className="mx-auto flex w-full max-w-[1480px] flex-col gap-3">
        <PublicSiteHeader {...headerState.headerProps} />
        <header
          className="archive-main-brand-header archive-paper archive-panel relative z-20"
          style={{ overflow: "visible" }}
        >
          <div className="flex items-center justify-between gap-3 px-3 py-2 md:block md:py-3 lg:px-7 lg:py-5">
            <h1 className="min-w-0 break-words font-serif text-xl leading-tight text-stone-950 lg:text-4xl">
              Кабинет автора: {author.name}
            </h1>
            <AuthorMobileNavMenu
              incomingFriendRequestCount={incomingFriendRequestCount}
              logoutSlot={(
                <form action={logoutAuthor}>
                  <button
                    type="submit"
                    className="flex w-full items-center rounded-md px-3 py-2.5 text-left text-sm font-medium text-stone-700 transition-colors hover:bg-stone-200/60 hover:text-stone-950"
                  >
                    Выйти
                  </button>
                </form>
              )}
            />
          </div>

          <nav
            aria-label="Навигация кабинета автора"
            className="hidden flex-wrap items-center gap-2 border-t border-stone-300/70 px-3 py-3 md:flex lg:px-7"
          >
            <AuthorProposalsMenu />
            <Link
              href="/author/profile"
              className={buttonVariants({ variant: "outline", size: "sm" })}
            >
              Профиль
            </Link>
            <Link
              href="/author/friends"
              className={`${buttonVariants({ variant: "outline", size: "sm" })} relative`}
            >
              Друзья
              <NotificationBadge count={incomingFriendRequestCount} className="absolute -right-2 -top-2 min-w-4 px-1 text-[9px] leading-4" />
            </Link>
            <form action={logoutAuthor}>
              <Button type="submit" variant="outline" size="sm" className="cursor-pointer">
                Выйти
              </Button>
            </form>
          </nav>
        </header>

        <section
          className="archive-paper-surface archive-panel author-content-shell min-w-0 p-5 sm:p-6"
          style={{ overflow: "visible" }}
        >
          {children}
        </section>
      </div>
    </main>
  );
}
