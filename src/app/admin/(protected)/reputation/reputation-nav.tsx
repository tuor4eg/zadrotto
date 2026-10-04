"use client";

import { Gauge, ShieldCheck } from "lucide-react";
import Link from "next/link";
import { usePathname } from "next/navigation";

import { cn } from "@/lib/common/utils";

const ITEMS = [
  { href: "/admin/reputation/levels", icon: Gauge, label: "Уровни" },
  { href: "/admin/reputation/trust", icon: ShieldCheck, label: "Доверие" },
] as const;

export function ReputationNav() {
  const pathname = usePathname();

  return (
    <nav
      aria-label="Разделы уровней и доверия"
      className="flex gap-2 overflow-x-auto rounded-md border border-stone-200 bg-white p-2 lg:grid lg:overflow-visible"
    >
      {ITEMS.map((item) => {
        const Icon = item.icon;
        const isActive = pathname === item.href || pathname.startsWith(`${item.href}/`);

        return (
          <Link
            key={item.href}
            href={item.href}
            aria-current={isActive ? "page" : undefined}
            className={cn(
              "flex shrink-0 items-center gap-2 rounded-sm px-3 py-2 text-sm font-medium transition-colors",
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
