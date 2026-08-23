"use client";

import { ChevronDown, Menu, X } from "lucide-react";
import Link from "next/link";
import { useEffect, useRef, useState } from "react";

import { buttonVariants } from "@/components/ui/button";
import { NotificationBadge } from "@/components/ui/notification-badge";

const PRIMARY_LINKS = [
  { href: "/author", label: "Статистика" },
  { href: "/author/quizzes", label: "Викторины" },
  { href: "/author/achievements", label: "Ачивки" },
  { href: "/author/reviews", label: "Рецензии" },
  { href: "/author/profile", label: "Профиль" },
  { href: "/author/settings/media-types", label: "Интересы" },
] as const;

export function AuthorMobileNavMenu({
  incomingFriendRequestCount,
  logoutSlot,
}: {
  incomingFriendRequestCount: number;
  logoutSlot: React.ReactNode;
}) {
  const [isOpen, setIsOpen] = useState(false);
  const [isProposalsOpen, setIsProposalsOpen] = useState(false);
  const rootRef = useRef<HTMLDivElement>(null);
  const triggerRef = useRef<HTMLButtonElement>(null);

  useEffect(() => {
    if (!isOpen) return;
    function handlePointerDown(event: PointerEvent) {
      if (!rootRef.current?.contains(event.target as Node)) {
        setIsOpen(false);
        setIsProposalsOpen(false);
      }
    }
    function handleKeyDown(event: KeyboardEvent) {
      if (event.key === "Escape") {
        setIsOpen(false);
        setIsProposalsOpen(false);
        triggerRef.current?.focus();
      }
    }
    document.addEventListener("pointerdown", handlePointerDown);
    document.addEventListener("keydown", handleKeyDown);
    return () => {
      document.removeEventListener("pointerdown", handlePointerDown);
      document.removeEventListener("keydown", handleKeyDown);
    };
  }, [isOpen]);

  function closeMenu() {
    setIsOpen(false);
    setIsProposalsOpen(false);
  }

  const linkClassName = "flex items-center rounded-md px-3 py-2.5 text-sm font-medium text-stone-700 transition-colors hover:bg-stone-200/60 hover:text-stone-950";

  return (
    <div ref={rootRef} className="relative md:hidden">
      <button
        ref={triggerRef}
        type="button"
        aria-label={isOpen ? "Закрыть меню кабинета" : "Открыть меню кабинета"}
        aria-controls="author-mobile-nav-panel"
        aria-expanded={isOpen}
        onClick={() => {
          if (isOpen) {
            closeMenu();
            return;
          }
          setIsOpen(true);
        }}
        className={buttonVariants({ variant: "outline", size: "icon" })}
      >
        {isOpen ? <X /> : <Menu />}
      </button>

      {isOpen ? (
        <nav
          id="author-mobile-nav-panel"
          aria-label="Мобильная навигация кабинета автора"
          className="archive-paper-surface absolute right-0 top-full z-[60] mt-1 grid w-[min(20rem,calc(100vw-1.5rem))] gap-1 rounded-md border border-stone-300 bg-white p-2 shadow-lg"
        >
          {PRIMARY_LINKS.slice(0, 3).map((item) => (
            <Link key={item.href} href={item.href} onClick={closeMenu} className={linkClassName}>
              {item.label}
            </Link>
          ))}

          <div className="my-1 border-y border-stone-200 py-1">
            <button
              type="button"
              aria-expanded={isProposalsOpen}
              aria-controls="author-mobile-proposals-panel"
              onClick={() => setIsProposalsOpen((current) => !current)}
              className={`${linkClassName} w-full justify-between text-left`}
            >
              Предложения
              <ChevronDown className={`size-4 transition-transform ${isProposalsOpen ? "rotate-180" : ""}`} />
            </button>
            {isProposalsOpen ? (
              <div id="author-mobile-proposals-panel" className="ml-3 grid gap-1 border-l border-stone-200 pl-2">
                <Link href="/author/media" onClick={closeMenu} className={linkClassName}>Записи</Link>
                <Link href="/author/series" onClick={closeMenu} className={linkClassName}>Серии</Link>
              </div>
            ) : null}
          </div>

          {PRIMARY_LINKS.slice(3).map((item) => (
            <Link key={item.href} href={item.href} onClick={closeMenu} className={linkClassName}>
              {item.label}
            </Link>
          ))}
          <Link href="/author/friends" onClick={closeMenu} className={`${linkClassName} justify-between`}>
            Друзья
            <NotificationBadge count={incomingFriendRequestCount} />
          </Link>

          <div className="mt-1 border-t border-stone-200 pt-1">{logoutSlot}</div>
        </nav>
      ) : null}
    </div>
  );
}
