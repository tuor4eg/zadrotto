"use client";

import { useEffect, useRef, useState } from "react";
import Link from "next/link";
import {
  Archive,
  Activity,
  ChevronDown,
  FileClock,
  FileText,
  House,
  KeyRound,
  Layers3,
  Mail,
  Menu,
  Package,
  MessageSquareText,
  Newspaper,
  Settings,
  ServerCog,
  Plug,
  ShieldCheck,
  Tags,
  Wrench,
  UserRound,
  X,
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

type AdminNavGroup = AdminNavMenuProps & {
  key: string;
};

function formatBadgeCount(count: number) {
  return count > 99 ? "99+" : String(count);
}

function getAdminNavGroups({
  submittedMediaItemsCount = 0,
  submittedFranchisesCount = 0,
  submittedReviewsCount = 0,
}: {
  submittedMediaItemsCount?: number;
  submittedFranchisesCount?: number;
  submittedReviewsCount?: number;
} = {}): AdminNavGroup[] {
  return [
    {
      key: "content",
      icon: FileText,
      label: "Записи",
      items: [
        { href: "/admin/media", icon: FileText, label: "Записи" },
        { href: "/admin/media-types", icon: Tags, label: "Типы" },
        { href: "/admin/franchises", icon: Layers3, label: "Серии" },
        { href: "/admin/media-carriers", icon: Package, label: "Носители" },
      ],
    },
    {
      key: "materials",
      icon: Newspaper,
      label: "Материалы",
      items: [
        { href: "/admin/materials/reviews", icon: MessageSquareText, label: "Рецензии" },
      ],
    },
    {
      key: "authors",
      icon: UserRound,
      label: "Авторы",
      items: [
        { href: "/admin/authors", icon: UserRound, label: "Авторы" },
        { href: "/admin/author-tokens", icon: KeyRound, label: "Токены" },
        { href: "/admin/access-profiles", icon: ShieldCheck, label: "Профили" },
        { href: "/admin/registration-review", icon: FileClock, label: "Регистрации" },
      ],
    },
    {
      key: "requests",
      count: submittedMediaItemsCount + submittedFranchisesCount + submittedReviewsCount,
      icon: FileClock,
      label: "Заявки",
      items: [
        {
          href: "/admin/media-review",
          icon: FileText,
          label: "Записи",
          count: submittedMediaItemsCount,
        },
        {
          href: "/admin/franchise-review",
          icon: Layers3,
          label: "Серии",
          count: submittedFranchisesCount,
        },
        {
          href: "/admin/reviews",
          icon: MessageSquareText,
          label: "Рецензии",
          count: submittedReviewsCount,
        },
      ],
    },
    {
      key: "tools",
      icon: Wrench,
      label: "Инструменты",
      items: [
        { href: "/admin/settings/administrator", icon: Settings, label: "Настройки" },
        { href: "/admin/tools/providers", icon: Plug, label: "Провайдеры" },
        { href: "/admin/tools/services", icon: ServerCog, label: "Сервисы" },
        { href: "/admin/tools/email", icon: Mail, label: "Email" },
        { href: "/admin/tools/activity", icon: Activity, label: "Журнал" },
      ],
    },
  ];
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

export function AdminMobileNavMenu({
  logoutSlot,
  submittedMediaItemsCount,
  submittedFranchisesCount,
  submittedReviewsCount,
}: {
  logoutSlot: React.ReactNode;
  submittedMediaItemsCount: number;
  submittedFranchisesCount: number;
  submittedReviewsCount: number;
}) {
  const [isOpen, setIsOpen] = useState(false);
  const [openGroups, setOpenGroups] = useState<Record<string, boolean>>({
    content: true,
    requests: submittedMediaItemsCount + submittedFranchisesCount + submittedReviewsCount > 0,
  });
  const rootRef = useRef<HTMLDivElement>(null);
  const groups = getAdminNavGroups({ submittedMediaItemsCount, submittedFranchisesCount, submittedReviewsCount });

  useEffect(() => {
    if (!isOpen) {
      return;
    }

    function handlePointerDown(event: PointerEvent) {
      if (!rootRef.current?.contains(event.target as Node)) {
        closeMenu();
      }
    }

    function handleKeyDown(event: KeyboardEvent) {
      if (event.key === "Escape") {
        closeMenu();
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
  }

  function toggleGroup(key: string) {
    setOpenGroups((current) => ({ ...current, [key]: !current[key] }));
  }

  return (
    <div ref={rootRef} className="md:hidden">
      <button
        type="button"
        aria-label={isOpen ? "Закрыть меню админки" : "Открыть меню админки"}
        aria-controls="admin-mobile-nav-panel"
        aria-expanded={isOpen}
        onClick={() => setIsOpen((current) => !current)}
        className={`${buttonVariants({ variant: "outline", size: "icon" })} fixed left-4 top-4 z-50 shadow-sm md:hidden`}
      >
        {isOpen ? <X /> : <Menu />}
      </button>

      {isOpen ? (
        <div
          id="admin-mobile-nav-panel"
          role="dialog"
          aria-modal="true"
          aria-label="Меню админки"
          className="fixed inset-0 z-40 overflow-y-auto bg-white px-4 pb-6 pt-16 md:hidden"
        >
          <div className="mx-auto grid w-full max-w-md gap-1">
            <Link
              href="/admin"
              onClick={closeMenu}
              className="flex items-center gap-2 rounded-md px-3 py-2 text-sm font-medium text-stone-700 transition-colors hover:bg-stone-100 hover:text-stone-950"
            >
              <House className="size-4" />
              Главная
            </Link>

            {groups.map((group) => {
              const Icon = group.icon;
              const isGroupOpen = openGroups[group.key] ?? false;

              return (
                <div key={group.key} className="rounded-md border border-stone-100">
                  <button
                    type="button"
                    onClick={() => toggleGroup(group.key)}
                    className="flex w-full items-center gap-2 rounded-md px-3 py-2 text-left text-sm font-medium text-stone-700 transition-colors hover:bg-stone-50 hover:text-stone-950"
                    aria-expanded={isGroupOpen}
                  >
                    <Icon className="size-4" />
                    <span className="min-w-0 flex-1 truncate">{group.label}</span>
                    {group.count && group.count > 0 ? (
                      <span
                        aria-label={`${group.count} заявок`}
                        className="grid h-5 min-w-5 place-items-center rounded-full bg-red-600 px-1.5 text-[11px] font-semibold leading-none text-white"
                      >
                        {formatBadgeCount(group.count)}
                      </span>
                    ) : null}
                    <ChevronDown
                      className={`size-4 transition-transform ${isGroupOpen ? "rotate-180" : ""}`}
                    />
                  </button>

                  {isGroupOpen ? (
                    <div className="ml-4 grid gap-1 border-l border-t border-stone-100 py-2 pl-3 pr-1">
                      {group.items.map((item) => {
                        const ItemIcon = item.icon;

                        return (
                          <Link
                            key={item.href}
                            href={item.href}
                            onClick={closeMenu}
                            className="grid grid-cols-[auto_minmax(0,1fr)_auto] items-center gap-2 rounded-sm px-3 py-2.5 text-sm text-stone-600 transition-colors hover:bg-stone-100 hover:text-stone-950"
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
                  ) : null}
                </div>
              );
            })}

            <div className="mt-1 border-t border-stone-100 pt-1">
              <Link
                href="/"
                onClick={closeMenu}
                className="flex items-center gap-2 rounded-md px-3 py-2 text-sm font-medium text-stone-700 transition-colors hover:bg-stone-100 hover:text-stone-950"
              >
                <Archive className="size-4" />
                Архив
              </Link>
              {logoutSlot}
            </div>
          </div>
        </div>
      ) : null}
    </div>
  );
}

export function AdminRequestsMenu({
  submittedMediaItemsCount,
  submittedFranchisesCount,
  submittedReviewsCount,
}: {
  submittedMediaItemsCount: number;
  submittedFranchisesCount: number;
  submittedReviewsCount: number;
}) {
  const group = getAdminNavGroups({ submittedMediaItemsCount, submittedFranchisesCount, submittedReviewsCount })
    .find((item) => item.key === "requests");

  return (
    <AdminNavMenu
      count={group?.count}
      icon={group?.icon ?? FileClock}
      label={group?.label ?? "Заявки"}
      items={group?.items ?? []}
    />
  );
}

export function AdminContentMenu() {
  const group = getAdminNavGroups().find((item) => item.key === "content");

  return (
    <AdminNavMenu
      icon={group?.icon ?? FileText}
      label={group?.label ?? "Записи"}
      items={group?.items ?? []}
    />
  );
}

export function AdminMaterialsMenu() {
  const group = getAdminNavGroups().find((item) => item.key === "materials");

  return (
    <AdminNavMenu
      icon={group?.icon ?? Newspaper}
      label={group?.label ?? "Материалы"}
      items={group?.items ?? []}
    />
  );
}

export function AdminAuthorsMenu() {
  const group = getAdminNavGroups().find((item) => item.key === "authors");

  return (
    <AdminNavMenu
      icon={group?.icon ?? UserRound}
      label={group?.label ?? "Авторы"}
      items={group?.items ?? []}
    />
  );
}

export function AdminToolsMenu() {
  const group = getAdminNavGroups().find((item) => item.key === "tools");

  return (
    <AdminNavMenu
      icon={group?.icon ?? Wrench}
      label={group?.label ?? "Инструменты"}
      items={group?.items ?? []}
    />
  );
}
