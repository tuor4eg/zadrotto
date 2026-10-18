"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { UserRound, Tags, ContactRound } from "lucide-react";
import { cn } from "@/lib/common/utils";

const items = [
  { href: "/admin/creators", label: "Создатели", icon: UserRound },
  { href: "/admin/creators/types", label: "Типы", icon: Tags },
  { href: "/admin/creators/roles", label: "Роли", icon: ContactRound },
];

export function CreatorsNav() {
  const pathname = usePathname();
  return <nav aria-label="Разделы создателей" className="flex gap-2 overflow-x-auto rounded-md border border-stone-200 bg-white p-2 lg:grid lg:overflow-visible">
    {items.map(item => {
      const active = item.href === "/admin/creators"
        ? !pathname.startsWith("/admin/creators/types") && !pathname.startsWith("/admin/creators/roles")
        : pathname === item.href || pathname.startsWith(`${item.href}/`);
      const Icon = item.icon;
      return <Link key={item.href} href={item.href} aria-current={active ? "page" : undefined}
        className={cn("flex shrink-0 items-center gap-2 rounded-sm px-3 py-2 text-sm font-medium transition-colors", active ? "bg-stone-950 text-white" : "text-stone-600 hover:bg-stone-100 hover:text-stone-950")}>
        <Icon className="size-4 shrink-0" />{item.label}
      </Link>;
    })}
  </nav>;
}
