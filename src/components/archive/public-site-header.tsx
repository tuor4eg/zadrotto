"use client";

import Image from "next/image";
import Link from "next/link";
import { Search, Shield, UserRound } from "lucide-react";
import { useRouter } from "next/navigation";
import { type ReactNode, useState } from "react";
import { createPortal } from "react-dom";

import { AuthorLoginModal } from "@/app/author/login/author-login-modal";
import { NotificationBell } from "@/components/notifications/notification-inbox";
import { Avatar } from "@/components/ui/avatar";
import { NotificationBadge } from "@/components/ui/notification-badge";
import { useDemoProfile } from "@/lib/user-state/use-demo-profile";

export type PublicSiteHeaderProps = {
  adminNotificationCount: number;
  author: {
    avatarObjectKey: string | null;
    name: string;
  } | null;
  controls?: ReactNode;
  currentAdminUser: boolean;
};

const MENU_ITEMS = [
  { href: "/archive", label: "Архив" },
  { href: "/series", label: "Серии" },
  { href: "/collections", label: "Подборки" },
  { href: "/reviews", label: "Рецензии" },
] as const;

export function PublicSiteHeader({
  adminNotificationCount,
  author,
  controls,
  currentAdminUser,
}: PublicSiteHeaderProps) {
  const router = useRouter();
  const [isLoginOpen, setIsLoginOpen] = useState(false);
  const demoProfile = useDemoProfile();
  const isDemo = Boolean(!author && demoProfile && demoProfile.import.importedAt == null);
  const showAchievements = Boolean(author || isDemo);

  return (
    <>
      <div className="public-site-header z-50 w-full text-stone-100">
        <header className="mx-auto flex h-14 w-full max-w-[1480px] items-center gap-2 lg:gap-4">
          <Link href="/" aria-label="Главная" className="flex shrink-0 items-center gap-2">
            <Image
              src="/site-logo.png"
              alt=""
              width={60}
              height={60}
              className="size-[60px] object-contain"
              priority
            />
            <span className="hidden font-mono text-xs font-semibold uppercase tracking-[0.16em] text-stone-100 sm:inline">
              Задротто
            </span>
          </Link>

          <nav aria-label="Основная навигация" className="hidden items-center gap-3 lg:flex">
            {(showAchievements
              ? [...MENU_ITEMS, { href: "/achievements", label: "Ачивки" }]
              : MENU_ITEMS
            ).map((item) => (
              <Link
                key={item.href}
                href={item.href}
                className="font-mono text-[10px] uppercase tracking-[0.12em] text-stone-300 transition-colors hover:text-white"
              >
                {item.label}
              </Link>
            ))}
          </nav>

          {isDemo ? (
            <button
              type="button"
              onClick={() => setIsLoginOpen(true)}
              className="hidden min-w-0 max-w-[18rem] shrink items-start rounded-md border border-amber-200/35 bg-amber-950/35 px-2.5 py-1 text-left transition-colors hover:border-amber-100/50 hover:bg-amber-900/45 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-amber-200/50 md:flex xl:max-w-[24rem]"
              aria-label="Демо-режим. Данные хранятся только на устройстве, авторизуйтесь чтобы не потерять их"
            >
              <span className="min-w-0">
                <span className="block font-mono text-[9px] font-semibold uppercase tracking-[0.14em] text-amber-100">
                  Демо-режим
                </span>
                <span className="mt-0.5 block text-[10px] leading-snug text-amber-50/85">
                  Данные хранятся только на устройстве, авторизуйтесь чтобы не потерять их
                </span>
              </span>
            </button>
          ) : null}

          <div className="ml-auto flex min-w-0 flex-1 items-center justify-end gap-1.5">
            {isDemo ? (
              <button
                type="button"
                onClick={() => setIsLoginOpen(true)}
                className="shrink-0 rounded-md border border-amber-200/35 bg-amber-950/35 px-2 py-1 font-mono text-[9px] font-semibold uppercase tracking-[0.14em] text-amber-100 transition-colors hover:border-amber-100/50 hover:bg-amber-900/45 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-amber-200/50 md:hidden"
                aria-label="Демо-режим. Данные хранятся только на устройстве, авторизуйтесь чтобы не потерять их"
                title="Данные хранятся только на устройстве, авторизуйтесь чтобы не потерять их"
              >
                Демо
              </button>
            ) : null}
            {controls ? (
              <div className="min-w-0 flex-1 text-stone-950">{controls}</div>
            ) : (
              <form
                action="/archive"
                method="get"
                role="search"
                aria-label="Поиск по архиву"
                className="min-w-0"
              >
                <label className="sr-only" htmlFor="public-header-search">
                  Поиск по архиву
                </label>
                <div className="relative w-full sm:w-56 lg:w-60">
                  <Search
                    aria-hidden="true"
                    className="pointer-events-none absolute left-2.5 top-1/2 size-3.5 -translate-y-1/2 text-stone-500"
                  />
                  <input
                    id="public-header-search"
                    name="q"
                    type="search"
                    autoComplete="off"
                    className="archive-control-surface h-9 w-full appearance-none rounded-lg border-0 pl-8 pr-3 text-xs text-stone-950 shadow-none outline-none placeholder:text-stone-500 focus:ring-2 focus:ring-stone-400/40"
                    placeholder="Поиск"
                  />
                </div>
              </form>
            )}

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
                className="grid size-9 shrink-0 place-items-center rounded-full border border-stone-200 bg-white text-stone-700 transition-colors hover:bg-stone-200 hover:text-stone-950 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-stone-300"
                onClick={() => setIsLoginOpen(true)}
              >
                <UserRound className="size-5" aria-hidden="true" />
              </button>
            )}
          </div>
        </header>

      </div>

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
