"use client";

import Link from "next/link";
import { useEffect, useId, useRef, useState } from "react";

import { logoutAuthor } from "@/app/author/actions";
import { Avatar } from "@/components/ui/avatar";
import { NotificationBadge } from "@/components/ui/notification-badge";
import type { PublicSiteHeaderProps } from "./public-site-header";

export function AuthorAvatarMenu({ author }: { author: NonNullable<PublicSiteHeaderProps["author"]> }) {
  const [isOpen, setIsOpen] = useState(false);
  const menuId = useId();
  const rootRef = useRef<HTMLDivElement>(null);
  const triggerRef = useRef<HTMLButtonElement>(null);

  useEffect(() => {
    if (!isOpen) return;
    function closeOutside(event: PointerEvent) {
      if (!rootRef.current?.contains(event.target as Node)) setIsOpen(false);
    }
    function closeOnEscape(event: KeyboardEvent) {
      if (event.key === "Escape") {
        setIsOpen(false);
        triggerRef.current?.focus();
      }
    }
    document.addEventListener("pointerdown", closeOutside);
    document.addEventListener("keydown", closeOnEscape);
    return () => {
      document.removeEventListener("pointerdown", closeOutside);
      document.removeEventListener("keydown", closeOnEscape);
    };
  }, [isOpen]);

  const itemClassName = "flex w-full items-center justify-between gap-3 rounded-md px-3 py-2 text-left text-sm text-stone-100 transition-colors hover:bg-white/10 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-stone-300";
  return (
    <div ref={rootRef} className="relative shrink-0" onBlur={(event) => {
      if (event.relatedTarget && !event.currentTarget.contains(event.relatedTarget)) setIsOpen(false);
    }}>
      <button ref={triggerRef} type="button" aria-label="Меню профиля" aria-expanded={isOpen} aria-controls={menuId}
        onClick={() => setIsOpen((open) => !open)}
        className="relative grid size-9 place-items-center rounded-full focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-stone-300 focus-visible:ring-offset-2">
        <Avatar name={author.name} objectKey={author.avatarObjectKey} className="size-9 text-xs" />
        <NotificationBadge count={author.incomingFriendRequestCount} className="absolute -right-2 -top-2 min-w-4 px-1 text-[9px] leading-4" />
      </button>
      {isOpen ? (
        <nav id={menuId} aria-label="Меню профиля" className="absolute right-0 top-full z-[80] mt-2 grid min-w-48 gap-1 rounded-lg border border-stone-700 bg-stone-900 p-2 shadow-xl">
          {[
            { href: `/users/${author.id}`, label: "Мой профиль" },
            { href: "/author/profile", label: "Настройки" },
            { href: "/author/media", label: "Предложения" },
            { href: "/author/friends", label: "Друзья" },
          ].map((item) => (
            <Link key={item.href} href={item.href} className={itemClassName} onClick={() => setIsOpen(false)}>
              {item.label}
              {item.href === "/author/friends" ? <NotificationBadge count={author.incomingFriendRequestCount} /> : null}
            </Link>
          ))}
          <form action={logoutAuthor} className="border-t border-stone-700 pt-1">
            <button type="submit" className={itemClassName}>Выход</button>
          </form>
        </nav>
      ) : null}
    </div>
  );
}
