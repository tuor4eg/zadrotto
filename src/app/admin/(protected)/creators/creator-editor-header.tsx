import Link from "next/link";
import { ArrowLeft } from "lucide-react";
import { buttonVariants } from "@/components/ui/button";
import { PageHeader } from "../admin-ui";

export function CreatorEditorHeader({ id, name, active }: {
  id: number;
  name: string;
  active: "info" | "bindings" | "data";
}) {
  const base = `/admin/creators/${id}`;
  const tabs = [
    { key: "info", label: "Информация", href: `${base}/edit` },
    { key: "bindings", label: "Привязки", href: `${base}/edit?tab=bindings` },
    { key: "data", label: "Данные", href: `${base}/snapshots` },
  ];

  return <>
    <PageHeader title={name} description={`Редактирование создателя · №${id}`} aside={
      <Link href="/admin/creators" className={buttonVariants({ variant: "outline" })}><ArrowLeft className="size-4" />Назад</Link>
    } />
    <nav aria-label="Редактирование создателя" className="flex flex-wrap gap-2">
      {tabs.map(({ key, label, href }) => (
        <Link key={key} href={href} aria-current={active === key ? "page" : undefined}
          className={buttonVariants({ variant: active === key ? "default" : "outline", size: "sm" })}>
          {label}
        </Link>
      ))}
    </nav>
  </>;
}
