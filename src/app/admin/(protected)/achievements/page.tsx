import Image from "next/image"
import Link from "next/link"
import { Edit3, Plus, Power, PowerOff, Trash2, Trophy } from "lucide-react"

import { Badge } from "@/components/ui/badge"
import { buttonVariants } from "@/components/ui/button"
import { ConfirmAction } from "@/components/ui/confirm-action"
import { PaginationNav } from "@/components/pagination-nav"
import { Table, TBody, TD, TH, THead, TR, TableWrap } from "@/components/ui/table"
import { Tooltip } from "@/components/ui/tooltip"
import {
  getAdminAchievements,
  type AdminAchievementStatusFilter,
  type AdminAchievementVisibilityFilter,
} from "@/db/queries/achievements"
import { AdminToasts, type AdminToast } from "../admin-toasts"
import { EmptyState, PageHeader } from "../admin-ui"
import { deleteAchievementAction, toggleAchievementAction } from "./actions"
import { AchievementFiltersForm } from "./achievement-filters-form"
import { getAchievementErrorMessage } from "./messages"

type Props = { searchParams: Promise<{ deleted?: string; disabled?: string; enabled?: string; error?: string; page?: string; q?: string; status?: string; visibility?: string }> }

function parsePage(value?: string) {
  const page = Number(value)
  return Number.isSafeInteger(page) && page > 0 ? page : 1
}

function parseStatus(value?: string): AdminAchievementStatusFilter {
  return value === "enabled" || value === "disabled" ? value : "all"
}

function parseVisibility(value?: string): AdminAchievementVisibilityFilter {
  return value === "regular" || value === "secret" ? value : "all"
}

function AchievementListActions({
  enabled,
  hasAwards,
  id,
  name,
}: {
  enabled: boolean
  hasAwards: boolean
  id: number
  name: string
}) {
  return (
    <div className="flex flex-nowrap justify-end gap-1.5">
      <Tooltip label={enabled ? "Выключить" : "Включить"}>
        <ConfirmAction
          action={toggleAchievementAction}
          confirmLabel={enabled ? "Выключить" : "Включить"}
          confirmVariant={enabled ? "destructive" : "default"}
          description={
            enabled
              ? `Ачивка «${name}» перестанет выдаваться. Уже полученные останутся у авторов.`
              : `Ачивка «${name}» снова будет выдаваться подходящим авторам.`
          }
          fields={[
            { name: "achievementId", value: id },
            { name: "enabled", value: enabled ? "0" : "1" },
          ]}
          title={enabled ? "Выключить ачивку?" : "Включить ачивку?"}
          triggerAriaLabel={enabled ? `Выключить ачивку ${name}` : `Включить ачивку ${name}`}
          triggerIcon={enabled ? <PowerOff /> : <Power />}
          triggerLabel={enabled ? "Выключить" : "Включить"}
          triggerSize="icon"
          triggerVariant={enabled ? "destructive" : "outline"}
        />
      </Tooltip>
      <Tooltip label="Изменить">
        <Link className={buttonVariants({ size: "icon", variant: "outline" })} href={`/admin/achievements/${id}/edit`} aria-label={`Изменить ачивку ${name}`}>
          <Edit3 />
        </Link>
      </Tooltip>
      <Tooltip label={hasAwards ? "Нельзя удалить: ачивку уже кто-то получил" : "Удалить"}>
        <ConfirmAction
          action={deleteAchievementAction}
          confirmLabel="Удалить"
          description={`Ачивка «${name}» будет удалена. Это возможно только пока её никто не получил.`}
          disabled={hasAwards}
          fields={[{ name: "achievementId", value: id }]}
          title="Удалить ачивку?"
          triggerAriaLabel={`Удалить ачивку ${name}`}
          triggerIcon={<Trash2 />}
          triggerLabel="Удалить"
          triggerSize="icon"
        />
      </Tooltip>
    </div>
  )
}

export default async function AdminAchievementsPage({ searchParams }: Props) {
  const query = await searchParams
  const searchQuery = query.q?.trim() ?? ""
  const status = parseStatus(query.status)
  const visibility = parseVisibility(query.visibility)
  const result = await getAdminAchievements({
    page: parsePage(query.page),
    searchQuery,
    status,
    visibility,
  })
  const items = result.items
  const hasActiveFilters = Boolean(searchQuery || status !== "all" || visibility !== "all")
  const successMessage = query.deleted === "1"
    ? "Ачивка удалена."
    : query.enabled === "1"
      ? "Ачивка включена."
      : query.disabled === "1"
        ? "Ачивка выключена."
        : null
  const errorMessage = getAchievementErrorMessage(query.error)
  const toastMessages = [
    ...(successMessage ? [{ id: "success", tone: "success" as const, text: successMessage }] : []),
    ...(errorMessage ? [{ id: "error", tone: "error" as const, text: errorMessage }] : []),
  ] satisfies AdminToast[]

  return <div className="flex flex-col gap-5">
    <AdminToasts clearParams={["deleted", "disabled", "enabled", "error"]} messages={toastMessages} />
    <PageHeader title="Ачивки" description="Механики, параметры и уровни каталога." aside={<Link className={buttonVariants()} href="/admin/achievements/new"><Plus />Добавить</Link>} />
    {result.totalCount > 0 || hasActiveFilters ? <AchievementFiltersForm searchQuery={searchQuery} status={status} visibility={visibility} /> : null}
    {result.totalCount === 0 && !hasActiveFilters ? <EmptyState>Ачивки пока не добавлены миграциями.</EmptyState> : items.length === 0 ? <EmptyState>По заданным фильтрам ачивок нет.</EmptyState> : (
      <>
        <div className="grid gap-3 sm:hidden">
          {items.map((item) => (
            <div key={item.id} className="rounded-lg border border-stone-200 bg-white p-4 shadow-sm">
              <div className="flex items-start gap-3">
                <span className="relative grid size-12 shrink-0 place-items-center overflow-hidden rounded-full border bg-stone-100">
                  {item.imageUrl ? <Image alt="" fill sizes="48px" className="object-cover" src={item.imageUrl} unoptimized /> : <Trophy className="size-5 text-stone-500" />}
                </span>
                <div className="min-w-0">
                  <div className="break-words font-medium text-stone-950">{item.name}</div>
                  <div className="mt-1 text-xs leading-5 text-stone-500">{item.description}</div>
                  <div className="mt-1 font-mono text-[10px] text-stone-500">{item.mechanic}</div>
                  <div className="mt-2 flex flex-wrap gap-1.5">
                    <Badge variant={item.enabled ? "outline" : "warning"}>{item.enabled ? "Включена" : "Выключена"}</Badge>
                    <Badge variant="outline">{item.showWhenLocked ? "Видна заранее" : "Тайная"}</Badge>
                  </div>
                </div>
              </div>
              <div className="mt-4 border-t border-stone-100 pt-3">
                <AchievementListActions enabled={item.enabled} hasAwards={item.hasAwards} id={item.id} name={item.name} />
              </div>
            </div>
          ))}
        </div>

        <TableWrap className="hidden sm:block">
          <Table className="table-fixed">
            <THead>
              <tr>
                <TH>Ачивка</TH>
                <TH className="w-56">Статус</TH>
                <TH className="w-36 px-2 text-right">Действия</TH>
              </tr>
            </THead>
            <TBody>
              {items.map((item) => (
                <TR key={item.id}>
                  <TD className="min-w-0 overflow-hidden">
                    <div className="flex items-center gap-3">
                      <span className="relative grid size-12 shrink-0 place-items-center overflow-hidden rounded-full border bg-stone-100">
                        {item.imageUrl ? <Image alt="" fill sizes="48px" className="object-cover" src={item.imageUrl} unoptimized /> : <Trophy className="size-5 text-stone-500" />}
                      </span>
                      <div className="min-w-0">
                        <div className="truncate font-medium">{item.name}</div>
                        <div className="mt-1 line-clamp-2 text-xs text-stone-500">{item.description}</div>
                        <div className="mt-1 font-mono text-[10px] text-stone-500">{item.mechanic}</div>
                      </div>
                    </div>
                  </TD>
                  <TD>
                    <div className="flex flex-wrap gap-1.5">
                      <Badge variant={item.enabled ? "outline" : "warning"}>{item.enabled ? "Включена" : "Выключена"}</Badge>
                      <Badge variant="outline">{item.showWhenLocked ? "Видна заранее" : "Тайная"}</Badge>
                    </div>
                  </TD>
                  <TD className="px-2">
                    <AchievementListActions enabled={item.enabled} hasAwards={item.hasAwards} id={item.id} name={item.name} />
                  </TD>
                </TR>
              ))}
            </TBody>
          </Table>
        </TableWrap>
        <PaginationNav basePath="/admin/achievements" itemLabel="ачивок" page={result.page} pageSize={result.pageSize} searchParams={{ q: searchQuery || undefined, status: status === "all" ? undefined : status, visibility: visibility === "all" ? undefined : visibility }} totalCount={result.totalCount} totalPages={result.totalPages} />
      </>
    )}
  </div>
}
