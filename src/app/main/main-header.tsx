"use client";

import Image from "next/image";
import Link from "next/link";
import { Search, Shield, UserRound } from "lucide-react";
import { useRouter } from "next/navigation";
import { useState } from "react";
import { createPortal } from "react-dom";

import { AuthorLoginModal } from "@/app/author/login/author-login-modal";
import { NotificationBell } from "@/components/notifications/notification-inbox";
import { Avatar } from "@/components/ui/avatar";
import { NotificationBadge } from "@/components/ui/notification-badge";

type MainHeaderProps = {
  adminNotificationCount: number;
  author: {
    avatarObjectKey: string | null;
    name: string;
  } | null;
  currentAdminUser: boolean;
};

const MENU_ITEMS = [
  { href: "/archive", label: "Архив" },
  { href: "/series", label: "Серии" },
  { href: "/collections", label: "Подборки" },
] as const;

export function MainHeader({ adminNotificationCount, author, currentAdminUser }: MainHeaderProps) {
  const router = useRouter();
  const [isLoginOpen, setIsLoginOpen] = useState(false);

  return (
    <>
      <header className="flex h-14 items-center gap-2 lg:gap-4">
      <Link href="/" aria-label="Главная" className="flex shrink-0 items-center gap-2">
        <Image
          src="/site-logo.png"
          alt=""
          width={40}
          height={40}
          className="size-9 object-contain sm:size-10"
          priority
        />
        <span className="font-mono text-xs font-semibold uppercase tracking-[0.16em] text-stone-100">
          Задротто
        </span>
      </Link>

      <nav aria-label="Основная навигация" className="hidden items-center gap-3 lg:flex">
        {MENU_ITEMS.map((item) => (
          <Link
            key={item.href}
            href={item.href}
            className="font-mono text-[10px] uppercase tracking-[0.12em] text-stone-300 transition-colors hover:text-white"
          >
            {item.label}
          </Link>
        ))}
      </nav>

      <div className="ml-auto flex min-w-0 items-center gap-1.5">
        <form action="/archive" method="get" role="search" aria-label="Поиск по архиву" className="min-w-0">
          <label className="sr-only" htmlFor="main-header-search">
            Поиск по архиву
          </label>
          <div className="relative w-full sm:w-56 lg:w-60">
            <Search
              aria-hidden="true"
              className="pointer-events-none absolute left-2.5 top-1/2 size-3.5 -translate-y-1/2 text-stone-500"
            />
            <input
              id="main-header-search"
              name="q"
              type="search"
              autoComplete="off"
              className="archive-control-surface h-8 w-full appearance-none rounded-lg border-0 pl-8 pr-3 text-xs text-stone-950 shadow-none outline-none placeholder:text-stone-500 focus:ring-2 focus:ring-stone-400/40"
              placeholder="Поиск"
            />
          </div>
        </form>

        {author ? (
          <>
            <NotificationBell align="right" round />
            {currentAdminUser ? (
              <Link
                href="/admin"
                aria-label="Админка"
                className="relative grid size-8 shrink-0 place-items-center rounded-full border border-stone-200 bg-white text-stone-700 transition-colors hover:bg-stone-200 hover:text-stone-950 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-stone-300"
              >
                <Shield className="size-4" aria-hidden="true" />
                <NotificationBadge
                  count={adminNotificationCount}
                  className="absolute -right-2 -top-2 min-w-4 px-1 text-[9px] leading-4"
                />
              </Link>
            ) : null}
            <Link
              href="/author"
              aria-label="Перейти к статистике"
              className="grid size-8 shrink-0 place-items-center rounded-full focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-stone-700 focus-visible:ring-offset-2"
            >
              <Avatar
                name={author.name}
                objectKey={author.avatarObjectKey}
                className="size-8 text-xs"
              />
            </Link>
          </>
        ) : (
          <button
            type="button"
            aria-label="Войти"
            className="grid size-8 shrink-0 place-items-center rounded-full text-stone-300 transition-colors hover:bg-white/10 hover:text-white focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-stone-300"
            onClick={() => setIsLoginOpen(true)}
          >
            <UserRound className="size-5" aria-hidden="true" />
          </button>
        )}
      </div>
      </header>
      {isLoginOpen
        ? createPortal(
            <AuthorLoginModal
              onClose={() => setIsLoginOpen(false)}
              onSuccess={() => {
                setIsLoginOpen(false);
                router.refresh();
              }}
            />,
            document.body,
          )
        : null}
    </>
  );
}
