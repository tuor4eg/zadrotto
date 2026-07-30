"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { Bot, Workflow } from "lucide-react";

import { cn } from "@/lib/common/utils";

const ITEMS = [
  { href: "/admin/tools/ai/providers", label: "Провайдеры", icon: Bot },
  { href: "/admin/tools/ai/scenarios", label: "Сценарии", icon: Workflow },
] as const;

export function AiToolsNav() {
  const pathname = usePathname();
  return (
    <nav aria-label="Разделы AI" className="flex gap-2 overflow-x-auto rounded-md border border-stone-200 bg-white p-2 lg:grid">
      {ITEMS.map((item) => {
        const Icon = item.icon;
        const active = pathname.startsWith(item.href);
        return <Link key={item.href} href={item.href} aria-current={active ? "page" : undefined}
          className={cn("flex shrink-0 items-center gap-2 rounded-sm px-3 py-2 text-sm font-medium", active ? "bg-stone-950 text-white" : "text-stone-600 hover:bg-stone-100")}>
          <Icon className="size-4" />{item.label}
        </Link>;
      })}
    </nav>
  );
}
