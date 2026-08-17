import Image from "next/image";
import Link from "next/link";
import { Edit3, Plus, Trophy } from "lucide-react";

import { Badge } from "@/components/ui/badge";
import { buttonVariants } from "@/components/ui/button";
import { Table, TBody, TD, TH, THead, TR, TableWrap } from "@/components/ui/table";
import { Tooltip } from "@/components/ui/tooltip";
import { getAdminAchievements } from "@/db/queries/achievements";
import { AdminToasts, type AdminToast } from "../admin-toasts";
import { EmptyState, PageHeader } from "../admin-ui";
import { getAchievementErrorMessage } from "./messages";

type Props = { searchParams: Promise<{ error?: string }> };

export default async function AdminAchievementsPage({ searchParams }: Props) {
  const query = await searchParams
  const items = await getAdminAchievements()
  const errorMessage = getAchievementErrorMessage(query.error)
  const toastMessages = [
    ...(errorMessage ? [{ id: "error", tone: "error" as const, text: errorMessage }] : []),
  ] satisfies AdminToast[]

  return <div className="flex flex-col gap-5">
    <AdminToasts clearParams={["error"]} messages={toastMessages} />
    <PageHeader title="Ачивки" description="Механики, параметры и уровни каталога." aside={<Link className={buttonVariants()} href="/admin/achievements/new"><Plus />Добавить</Link>} />
    {items.length === 0 ? <EmptyState>Ачивки пока не добавлены миграциями.</EmptyState> : (
      <TableWrap><Table><THead><tr><TH>Ачивка</TH><TH>Статус</TH><TH /></tr></THead>
        <TBody>{items.map((item) => <TR key={item.id}>
          <TD><div className="flex items-center gap-3">
            <span className="relative grid size-12 shrink-0 place-items-center overflow-hidden rounded-full border bg-stone-100">
              {item.imageUrl ? <Image alt="" fill sizes="48px" className="object-cover" src={item.imageUrl} /> : <Trophy className="size-5 text-stone-500" />}
            </span>
            <div className="min-w-0"><div className="font-medium">{item.name}</div><div className="mt-1 line-clamp-2 text-xs text-stone-500">{item.description}</div><div className="mt-1 font-mono text-[10px] text-stone-500">{item.mechanic}</div></div>
          </div></TD>
          <TD><div className="flex flex-wrap gap-1.5"><Badge variant={item.enabled ? "outline" : "warning"}>{item.enabled ? "Включена" : "Выключена"}</Badge><Badge variant="outline">{item.showWhenLocked ? "Видна заранее" : "Тайная"}</Badge></div></TD>
          <TD className="text-right"><Tooltip label="Изменить"><Link className={buttonVariants({ size: "icon", variant: "outline" })} href={`/admin/achievements/${item.id}/edit`} aria-label={`Изменить ачивку ${item.name}`}><Edit3 /></Link></Tooltip></TD>
        </TR>)}</TBody></Table></TableWrap>
    )}
  </div>;
}
