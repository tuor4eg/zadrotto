import { ArrowLeft } from "lucide-react";
import Link from "next/link";

import { buttonVariants } from "@/components/ui/button";
import { PageHeader } from "../admin-ui";

export function MediaEditorHeader({ id, title, active }: {
  id: number;
  title: string;
  active: "info" | "sources" | "tags" | "data";
}) {
  const base = `/admin/media/${id}`;
  const tabs = [
    { key: "info", label: "Информация", href: `${base}/edit` },
    { key: "sources", label: "Первоисточники", href: `${base}/edit?tab=sources` },
    { key: "tags", label: "Теги", href: `${base}/edit?tab=tags` },
    { key: "data", label: "Данные", href: `${base}/snapshots` },
  ];

  return (
    <div className="grid gap-5">
      <PageHeader
        title={title}
        description={`Редактирование записи · №${id}`}
        aside={
          <Link href="/admin/media" className={buttonVariants({ variant: "outline" })}>
            <ArrowLeft className="size-4" />
            Назад
          </Link>
        }
      />
      <nav aria-label="Редактирование записи" className="flex flex-wrap gap-2">
        {tabs.map(({ key, label, href }) => (
          <Link key={key} href={href} aria-current={active === key ? "page" : undefined}
            className={buttonVariants({ variant: active === key ? "default" : "outline", size: "sm" })}>
            {label}
          </Link>
        ))}
      </nav>
    </div>
  );
}
