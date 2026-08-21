import Image from "next/image";
import Link from "next/link";

import { logoutAuthor } from "@/app/author/actions";
import { Button, buttonVariants } from "@/components/ui/button";
import { Avatar } from "@/components/ui/avatar";
import { requireAuthor } from "@/lib/auth/author-auth";
import { getIncomingFriendRequestCount } from "@/db/queries/friends";
import { NotificationBadge } from "@/components/ui/notification-badge";
import { NotificationBell } from "@/components/notifications/notification-inbox";
import { AuthorProposalsMenu } from "./author-proposals-menu";

export const dynamic = "force-dynamic";

type AuthorLayoutProps = {
  children: React.ReactNode;
};

export default async function AuthorLayout({ children }: AuthorLayoutProps) {
  const author = await requireAuthor();
  const incomingFriendRequestCount = await getIncomingFriendRequestCount(author.id);

  return (
    <main className="archive-page min-h-screen px-3 pb-3 pt-3 text-stone-950 sm:px-5 sm:pb-5 lg:px-7 lg:pb-7">
      <div className="mx-auto flex w-full max-w-[1480px] flex-col gap-3">
        <header
          className="archive-main-brand-header archive-paper archive-panel relative z-20"
          style={{ overflow: "visible" }}
        >
          <div className="flex items-center justify-between gap-3 px-3 py-3 pr-2 lg:gap-4 lg:px-7 lg:py-5">
            <div className="flex min-w-0 items-center gap-3 lg:gap-4">
              <Link href="/" className="flex shrink-0 lg:mt-1" aria-label="На главную">
                <Image
                  src="/site-logo.png"
                  alt=""
                  width={56}
                  height={56}
                  className="size-11 shrink-0 object-contain lg:size-14"
                  priority
                />
              </Link>
              <h1 className="min-w-0 break-words font-serif text-xl leading-tight text-stone-950 lg:text-4xl">
                Кабинет автора: {author.name}
              </h1>
            </div>
            <Link
              href="/author"
              aria-label="Главная кабинета автора"
              className="shrink-0 rounded-full focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-stone-950"
            >
              <Avatar
                name={author.name}
                objectKey={author.avatarObjectKey}
                className="size-11 shrink-0 border border-stone-300/80 lg:size-12"
              />
            </Link>
          </div>

          <nav
            aria-label="Навигация кабинета автора"
            className="flex flex-wrap items-center gap-2 border-t border-stone-300/70 px-3 py-3 lg:px-7"
          >
            <Link
              href="/author"
              className={buttonVariants({ variant: "outline", size: "sm" })}
            >
              Статистика
            </Link>
            <Link
              href="/author/quizzes"
              className={buttonVariants({ variant: "outline", size: "sm" })}
            >
              Викторины
            </Link>
            <Link
              href="/author/achievements"
              className={buttonVariants({ variant: "outline", size: "sm" })}
            >
              Ачивки
            </Link>
            <AuthorProposalsMenu />
            <Link
              href="/author/reviews"
              className={buttonVariants({ variant: "outline", size: "sm" })}
            >
              Рецензии
            </Link>
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
            <NotificationBell />
            <Link
              href="/author/settings/media-types"
              className={buttonVariants({ variant: "outline", size: "sm" })}
            >
              Интересы
            </Link>
            <form action={logoutAuthor}>
              <Button type="submit" variant="outline" size="sm" className="cursor-pointer">
                Выйти
              </Button>
            </form>
          </nav>
        </header>

        <section
          className="archive-paper-surface archive-panel author-content-shell p-5 sm:p-6"
          style={{ overflow: "visible" }}
        >
          {children}
        </section>
      </div>
    </main>
  );
}
