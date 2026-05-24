import {
  Archive,
  FileClock,
  FileText,
  KeyRound,
  Layers3,
  Settings,
  ShieldCheck,
  UserRound,
} from "lucide-react";
import Link from "next/link";

import { Card, CardContent } from "@/components/ui/card";
import { buttonVariants } from "@/components/ui/button";

export default function AdminPage() {
  const links = [
    { href: "/admin/franchises", label: "Серии", icon: Layers3 },
    { href: "/admin/media", label: "Записи", icon: FileText },
    { href: "/admin/authors", label: "Авторы", icon: UserRound },
    { href: "/admin/access-profiles", label: "Профили", icon: ShieldCheck },
    { href: "/admin/media-review", label: "Заявки", icon: FileClock },
    { href: "/admin/author-tokens", label: "Токены", icon: KeyRound },
    { href: "/admin/settings", label: "Настройки", icon: Settings },
    { href: "/", label: "Архив", icon: Archive },
  ];

  return (
    <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
      {links.map((link) => {
        const Icon = link.icon;

        return (
          <Card key={link.href}>
            <CardContent className="flex items-center justify-between gap-4 p-5">
              <div className="flex items-center gap-3">
                <div className="flex size-10 items-center justify-center rounded-md bg-stone-100 text-stone-600">
                  <Icon className="size-5" />
                </div>
                <div className="font-medium text-stone-950">{link.label}</div>
              </div>
              <Link href={link.href} className={buttonVariants({ variant: "outline", size: "sm" })}>
                Открыть
              </Link>
            </CardContent>
          </Card>
        );
      })}
    </div>
  );
}
