"use client";

import { Heart, MonitorSmartphone, UserRound } from "lucide-react";
import Link from "next/link";
import { usePathname } from "next/navigation";

import { cn } from "@/lib/common/utils";

const PROFILE_NAV_ITEMS = [
  {
    href: "/author/profile",
    label: "Общие",
    icon: UserRound,
  },
  {
    href: "/author/profile/interests",
    label: "Интересы",
    icon: Heart,
  },
  {
    href: "/author/profile/sessions",
    label: "Сессии",
    icon: MonitorSmartphone,
  },
] as const;

export function ProfileNav() {
  const pathname = usePathname();

  return (
    <nav
      aria-label="Разделы профиля"
      className="grid w-full min-w-0 max-w-full grid-cols-3 gap-1 rounded-md border border-stone-200 bg-white p-1 lg:grid-cols-1"
    >
      {PROFILE_NAV_ITEMS.map((item) => {
        const Icon = item.icon;
        const isActive = item.href === "/author/profile"
          ? pathname === item.href
          : pathname === item.href || pathname.startsWith(`${item.href}/`);

        return (
          <Link
            key={item.href}
            href={item.href}
            aria-current={isActive ? "page" : undefined}
            className={cn(
              "flex min-w-0 items-center justify-center gap-1 whitespace-nowrap rounded-sm px-1 py-2 text-xs font-medium transition-colors sm:px-2 sm:text-sm lg:justify-start",
              isActive
                ? "bg-stone-950 text-white"
                : "text-stone-600 hover:bg-stone-100 hover:text-stone-950",
            )}
          >
            <Icon className="size-4 shrink-0" />
            {item.label}
          </Link>
        );
      })}
    </nav>
  );
}
