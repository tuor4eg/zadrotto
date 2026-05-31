"use client";

import { useRef, useState } from "react";
import Link from "next/link";
import {
  ChevronDown,
  FileClock,
  FileText,
  KeyRound,
  Layers3,
  Package,
  MessageSquareText,
  Newspaper,
  ShieldCheck,
  UserRound,
  type LucideIcon,
} from "lucide-react";

import { buttonVariants } from "@/components/ui/button";

type AdminNavMenuItem = {
  count?: number;
  href: string;
  icon: LucideIcon;
  label: string;
};

type AdminNavMenuProps = {
  count?: number;
  icon: LucideIcon;
  items: AdminNavMenuItem[];
  label: string;
};

function formatBadgeCount(count: number) {
  return count > 99 ? "99+" : String(count);
}

function AdminNavMenu({ count = 0, icon: Icon, items, label }: AdminNavMenuProps) {
  const [isOpen, setIsOpen] = useState(false);
  const rootRef = useRef<HTMLDivElement>(null);
  const visibleCount = formatBadgeCount(count);

  function closeMenu() {
    setIsOpen(false);
  }

  function handleBlur(event: React.FocusEvent<HTMLDivElement>) {
    if (!rootRef.current?.contains(event.relatedTarget)) {
      closeMenu();
    }
  }

  return (
    <div
      ref={rootRef}
      className="relative"
      onMouseEnter={() => setIsOpen(true)}
      onMouseLeave={closeMenu}
      onFocus={() => setIsOpen(true)}
      onBlur={handleBlur}
    >
      <button
        type="button"
        aria-haspopup="menu"
        aria-expanded={isOpen}
        onClick={() => setIsOpen((current) => !current)}
        className={`${buttonVariants({ variant: "outline", size: "sm" })} relative`}
      >
        <Icon />
        {label}
        <ChevronDown
          className={`size-4 transition-transform ${isOpen ? "rotate-180" : ""}`}
        />
        {count > 0 ? (
          <span
            aria-label={`${count} заявок на модерацию`}
            className="absolute -right-2 -top-2 grid h-5 min-w-5 place-items-center rounded-full bg-red-600 px-1.5 text-[11px] font-semibold leading-none text-white shadow-sm"
          >
            {visibleCount}
          </span>
        ) : null}
      </button>
      <div
        className={`absolute right-0 top-full z-20 min-w-44 pt-2 transition ${
          isOpen ? "visible opacity-100" : "invisible opacity-0"
        }`}
      >
        <div className="rounded-md border border-stone-200 bg-white p-1 shadow-lg">
          {items.map((item) => {
            const ItemIcon = item.icon;

            return (
              <Link
                key={item.href}
                href={item.href}
                role="menuitem"
                onClick={closeMenu}
                className="grid grid-cols-[auto_minmax(0,1fr)_auto] items-center gap-2 rounded-sm px-3 py-2 text-sm text-stone-700 transition-colors hover:bg-stone-100 hover:text-stone-950"
              >
                <ItemIcon className="size-4" />
                <span className="truncate">{item.label}</span>
                {item.count && item.count > 0 ? (
                  <span
                    aria-label={`${item.count} заявок`}
                    className="grid h-5 min-w-5 place-items-center rounded-full bg-red-600 px-1.5 text-[11px] font-semibold leading-none text-white"
                  >
                    {formatBadgeCount(item.count)}
                  </span>
                ) : null}
              </Link>
            );
          })}
        </div>
      </div>
    </div>
  );
}

export function AdminRequestsMenu({
  submittedMediaItemsCount,
  submittedReviewsCount,
}: {
  submittedMediaItemsCount: number;
  submittedReviewsCount: number;
}) {
  return (
    <AdminNavMenu
      count={submittedMediaItemsCount + submittedReviewsCount}
      icon={FileClock}
      label="Заявки"
      items={[
        {
          href: "/admin/media-review",
          icon: FileText,
          label: "Записи",
          count: submittedMediaItemsCount,
        },
        {
          href: "/admin/reviews",
          icon: MessageSquareText,
          label: "Рецензии",
          count: submittedReviewsCount,
        },
      ]}
    />
  );
}

export function AdminContentMenu() {
  return (
    <AdminNavMenu
      icon={FileText}
      label="Записи"
      items={[
        { href: "/admin/media", icon: FileText, label: "Записи" },
        { href: "/admin/franchises", icon: Layers3, label: "Серии" },
        { href: "/admin/media-carriers", icon: Package, label: "Носители" },
      ]}
    />
  );
}

export function AdminMaterialsMenu() {
  return (
    <AdminNavMenu
      icon={Newspaper}
      label="Материалы"
      items={[
        { href: "/admin/materials/reviews", icon: MessageSquareText, label: "Рецензии" },
      ]}
    />
  );
}

export function AdminAuthorsMenu() {
  return (
    <AdminNavMenu
      icon={UserRound}
      label="Авторы"
      items={[
        { href: "/admin/authors", icon: UserRound, label: "Авторы" },
        { href: "/admin/author-tokens", icon: KeyRound, label: "Токены" },
        { href: "/admin/access-profiles", icon: ShieldCheck, label: "Профили" },
      ]}
    />
  );
}
