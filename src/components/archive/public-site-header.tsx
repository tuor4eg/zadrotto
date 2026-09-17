"use client";

import Image from "next/image";
import Link from "next/link";
import { CircleHelp, Menu, Search, Shield, UserRound, X } from "lucide-react";
import { useRouter } from "next/navigation";
import { type ReactNode, useEffect, useRef, useState } from "react";
import { createPortal } from "react-dom";

import { AuthorLoginModal } from "@/app/author/login/author-login-modal";
import { useExternalInterface } from "@/components/external-interface/external-interface-layer";
import { QuizModal } from "@/components/quizzes/quiz-modal";
import { Avatar } from "@/components/ui/avatar";
import { NotificationBadge } from "@/components/ui/notification-badge";
import type { ActiveQuiz, QuizHistoryEntry } from "@/lib/quizzes/model";
import { AUTHOR_RATING_TONE_CLASS_NAMES } from "@/lib/ratings/tone";
import { useDemoProfile } from "@/lib/user-state/use-demo-profile";

export type PublicSiteHeaderProps = {
  adminNotificationCount: number;
  author: {
    avatarObjectKey: string | null;
    name: string;
  } | null;
  controls?: ReactNode;
  currentAdminUser: boolean;
  quiz?: {
    history: QuizHistoryEntry | null;
    isParticipating: boolean;
    quiz: ActiveQuiz;
    unavailableMediaTypeNames: string[];
  } | null;
};

const BASE_MENU_ITEMS = [
  { href: "/archive", label: "Архив" },
  { href: "/series", label: "Серии" },
  { href: "/collections", label: "Подборки" },
  { href: "/reviews", label: "Рецензии" },
] as const;

const QUIZZES_MENU_ITEM = { href: "/quizzes", label: "Квизы" } as const;

export function PublicSiteHeader({
  adminNotificationCount,
  author,
  controls,
  currentAdminUser,
  quiz = null,
}: PublicSiteHeaderProps) {
  const router = useRouter();
  const { quizParticipant } = useExternalInterface();
  const [isLoginOpen, setIsLoginOpen] = useState(false);
  const [isMenuOpen, setIsMenuOpen] = useState(false);
  const [isQuizOpen, setIsQuizOpen] = useState(false);
  const menuButtonRef = useRef<HTMLButtonElement>(null);
  const menuRef = useRef<HTMLElement>(null);
  const demoProfile = useDemoProfile();
  const isDemo = Boolean(!author && demoProfile && demoProfile.import.importedAt == null);
  const showAchievements = Boolean(author || isDemo);
  const MENU_ITEMS = [
    ...BASE_MENU_ITEMS,
    ...(author ? [QUIZZES_MENU_ITEM] : []),
    ...(showAchievements ? [{ href: "/achievements", label: "Ачивки" } as const] : []),
  ];
  const isQuizCompleted = Boolean(
    quizParticipant?.quizId === quiz?.quiz.id && quizParticipant?.completed,
  );
  const visibleQuiz = quiz && !isQuizCompleted ? quiz : null;

  useEffect(() => {
    if (!isMenuOpen) return;

    function handlePointerDown(event: PointerEvent) {
      const target = event.target as Node;
      if (!menuButtonRef.current?.contains(target) && !menuRef.current?.contains(target)) {
        setIsMenuOpen(false);
      }
    }

    document.addEventListener("pointerdown", handlePointerDown);
    return () => document.removeEventListener("pointerdown", handlePointerDown);
  }, [isMenuOpen]);

  return (
    <>
      <div className="public-site-header z-[70] w-full text-stone-100">
        <header className="relative mx-auto flex w-full max-w-[1480px] flex-col gap-2 lg:h-14 lg:flex-row lg:items-center lg:gap-4">
          <div className="flex h-14 items-center gap-2 lg:contents">
          <Link href="/" aria-label="Главная" className="flex shrink-0 items-center gap-2">
            <Image
              src="/site-logo.png"
              alt=""
              width={60}
              height={60}
              className="size-[60px] object-contain"
              priority
            />
            <span className="font-mono text-xs font-semibold uppercase tracking-[0.16em] text-stone-100">
              Задротто
            </span>
          </Link>

          <button
            ref={menuButtonRef}
            type="button"
            aria-label={isMenuOpen ? "Закрыть меню" : "Открыть меню"}
            aria-expanded={isMenuOpen}
            aria-controls="public-header-mobile-menu"
            className="ml-auto grid size-10 shrink-0 place-items-center rounded-lg text-stone-100 hover:bg-white/10 lg:hidden"
            onClick={() => setIsMenuOpen((open) => !open)}
          >
            {isMenuOpen ? <X className="size-5" /> : <Menu className="size-5" />}
          </button>

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

          {isDemo ? (
            <button
              type="button"
              onClick={() => setIsLoginOpen(true)}
              className="hidden min-w-0 max-w-[18rem] shrink items-start rounded-md border border-amber-200/35 bg-amber-950/35 px-2.5 py-1 text-left transition-colors hover:border-amber-100/50 hover:bg-amber-900/45 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-amber-200/50 lg:flex xl:max-w-[24rem]"
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
          </div>

          {isMenuOpen ? (
            <nav
              ref={menuRef}
              id="public-header-mobile-menu"
              aria-label="Мобильная навигация"
              className="absolute right-0 top-14 z-50 grid min-w-44 gap-1 rounded-lg border border-stone-700 bg-stone-900 p-2 shadow-xl lg:hidden"
            >
              {MENU_ITEMS.map((item) => (
                <Link
                  key={item.href}
                  href={item.href}
                  onClick={() => setIsMenuOpen(false)}
                  className="rounded-md px-3 py-2 font-mono text-xs uppercase tracking-wide text-stone-100 hover:bg-white/10"
                >
                  {item.label}
                </Link>
              ))}
            </nav>
          ) : null}

          <div className="flex min-w-0 w-full items-center gap-1.5 lg:ml-auto lg:w-auto lg:flex-1 lg:justify-end">
            {controls ? (
              <div className="min-w-0 flex-1 text-stone-950">{controls}</div>
            ) : (
              <form
                action="/archive"
                method="get"
                role="search"
                aria-label="Поиск по архиву"
                className="min-w-0 flex-1 lg:flex-none"
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
                    placeholder="Поиск по архиву"
                  />
                </div>
              </form>
            )}

            {isDemo ? (
              <button
                type="button"
                onClick={() => setIsLoginOpen(true)}
                className="shrink-0 rounded-md border border-amber-200/35 bg-amber-950/35 px-2 py-1 font-mono text-[9px] font-semibold uppercase tracking-[0.14em] text-amber-100 transition-colors hover:border-amber-100/50 hover:bg-amber-900/45 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-amber-200/50 lg:hidden"
                aria-label="Демо-режим. Данные хранятся только на устройстве, авторизуйтесь чтобы не потерять их"
                title="Данные хранятся только на устройстве, авторизуйтесь чтобы не потерять их"
              >
                Демо
              </button>
            ) : null}

            {author ? (
              <>
                {currentAdminUser ? (
                  <Link
                    href="/admin"
                    aria-label="Админка"
                    className="relative grid size-9 shrink-0 place-items-center rounded-full border border-stone-200 bg-white text-stone-700 transition-colors hover:bg-stone-200 hover:text-stone-950 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-stone-300"
                  >
                    <Shield className="size-4" aria-hidden="true" />
                    <NotificationBadge
                      count={adminNotificationCount}
                      className="absolute -right-2 -top-2 min-w-4 px-1 text-[9px] leading-4"
                    />
                  </Link>
                ) : null}
                {author ? (
                  <button
                    type="button"
                    aria-label="Открыть текущую викторину"
                    className={`grid size-9 shrink-0 place-items-center rounded-full border transition-colors hover:bg-emerald-800 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-emerald-300 ${AUTHOR_RATING_TONE_CLASS_NAMES.good}`}
                    onClick={() => setIsQuizOpen(true)}
                  >
                    <CircleHelp className="size-5" aria-hidden="true" />
                  </button>
                ) : null}
                <Link
                  href="/author/profile"
                  aria-label="Открыть кабинет автора"
                  className="grid size-9 shrink-0 place-items-center rounded-full focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-stone-700 focus-visible:ring-offset-2"
                >
                  <Avatar
                    name={author.name}
                    objectKey={author.avatarObjectKey}
                    className="size-9 text-xs"
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
      {isQuizOpen ? (
        <QuizModal
          history={visibleQuiz?.history ?? null}
          isParticipating={visibleQuiz?.isParticipating ?? false}
          onClose={() => setIsQuizOpen(false)}
          quiz={visibleQuiz?.quiz ?? null}
          unavailableMediaTypeNames={visibleQuiz?.unavailableMediaTypeNames ?? []}
        />
      ) : null}
    </>
  );
}
