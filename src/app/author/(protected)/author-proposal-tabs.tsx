"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { cn } from "@/lib/common/utils";

export function AuthorProposalTabs() {
  const pathname = usePathname();
  return (
    <nav aria-label="Разделы предложений" className="grid grid-cols-2 gap-1 self-start rounded-md border border-stone-200 bg-white p-1">
      {[
        { href: "/author/media", label: "Записи" },
        { href: "/author/series", label: "Серии" },
      ].map((item) => (
        <Link key={item.href} href={item.href} aria-current={pathname === item.href ? "page" : undefined}
          className={cn("rounded-sm px-4 py-2 text-center text-sm font-medium transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-stone-400", pathname === item.href ? "bg-stone-950 text-white" : "text-stone-600 hover:bg-stone-100 hover:text-stone-950")}>
          {item.label}
        </Link>
      ))}
    </nav>
  );
}
