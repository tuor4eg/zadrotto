import Link from "next/link"
import { Edit3, Eye } from "lucide-react"

import { Avatar } from "@/components/ui/avatar"
import { ArchiveTooltip } from "@/components/ui/archive-tooltip"
import { Badge } from "@/components/ui/badge"
import { buttonVariants } from "@/components/ui/button"
import { formatRelativeArchiveDate } from "@/lib/archive/relative-date"

export type TierListCatalogItem = {
  id: number
  publicId: string
  title: string
  authorId: number
  authorName: string
  authorAvatarObjectKey: string | null
  status: "draft" | "published"
  hiddenAt: Date | string | null
  firstPublishedAt: Date | string | null
  updatedAt: Date | string
}

function isPublicTierList(item: TierListCatalogItem) {
  return item.status === "published" && !item.hiddenAt
}

function tierListHref(item: TierListCatalogItem, mine: boolean) {
  if (mine && !isPublicTierList(item)) return `/tier-lists/${item.publicId}/edit`

  return `/tier-lists/${item.publicId}`
}

function statusBadge(item: TierListCatalogItem) {
  if (item.hiddenAt) return <Badge variant="default">Скрыт</Badge>
  if (item.status === "draft") return <Badge variant="outline">Черновик</Badge>

  return <Badge variant="positive">Опубликован</Badge>
}

function catalogDate(item: TierListCatalogItem, mine: boolean) {
  const updated = formatRelativeArchiveDate(item.updatedAt)
  const published = item.firstPublishedAt ? formatRelativeArchiveDate(item.firstPublishedAt) : null

  if (!mine) return { primary: published ?? "—", secondary: null }

  return {
    primary: published ?? updated ?? "—",
    secondary: published && updated ? `обновлено ${updated}` : null,
  }
}

function TierListActions({ item }: { item: TierListCatalogItem }) {
  const canOpen = isPublicTierList(item)

  return (
    <div className="flex shrink-0 items-center justify-end gap-1.5">
      {canOpen ? (
        <ArchiveTooltip label="Открыть">
          <Link
            href={`/tier-lists/${item.publicId}`}
            className={buttonVariants({ variant: "outline", size: "icon" })}
            aria-label={`Открыть тир-лист «${item.title}»`}
          >
            <Eye />
          </Link>
        </ArchiveTooltip>
      ) : null}
      <ArchiveTooltip label="Редактировать">
        <Link
          href={`/tier-lists/${item.publicId}/edit`}
          className={buttonVariants({ variant: "outline", size: "icon" })}
          aria-label={`Редактировать тир-лист «${item.title}»`}
        >
          <Edit3 />
        </Link>
      </ArchiveTooltip>
    </div>
  )
}

function AuthorCell({ item }: { item: TierListCatalogItem }) {
  return (
    <span className="flex min-w-0 items-center gap-2">
      <Avatar
        name={item.authorName}
        objectKey={item.authorAvatarObjectKey}
        className="size-7 shrink-0 text-[9px]"
      />
      <span className="min-w-0 truncate text-sm text-stone-800">{item.authorName}</span>
    </span>
  )
}

export function TierListCatalogTable({
  items,
  mine,
}: {
  items: readonly TierListCatalogItem[]
  mine: boolean
}) {
  return (
    <div className="mt-2">
      <table className="hidden w-full border-collapse text-left md:table">
        <thead>
          <tr className="font-mono text-[10px] uppercase tracking-[0.14em] text-stone-500">
            <th scope="col" className="px-3 pb-2 font-medium">Название</th>
            <th scope="col" className="w-64 px-3 pb-2 font-medium">
              {mine ? "Состояние" : "Автор"}
            </th>
            <th scope="col" className="w-44 px-3 pb-2 font-medium">
              {mine ? "Обновлено" : "Опубликован"}
            </th>
            {mine ? (
              <th scope="col" className="w-24 px-3 pb-2 text-right font-medium">
                <span className="sr-only">Действия</span>
              </th>
            ) : null}
          </tr>
        </thead>
        <tbody>
          {items.map((item) => {
            const date = catalogDate(item, mine)
            const href = tierListHref(item, mine)

            return (
              <tr
                key={item.id}
                className="border-t border-stone-300/60 transition-colors hover:bg-stone-50/50"
              >
                <td className="px-3 py-2.5">
                  <Link
                    href={href}
                    className="block truncate text-sm font-semibold text-stone-950 hover:underline hover:underline-offset-4"
                  >
                    {item.title}
                  </Link>
                </td>
                <td className="px-3 py-2.5">
                  {mine ? statusBadge(item) : <AuthorCell item={item} />}
                </td>
                <td className="px-3 py-2.5 text-xs text-stone-600">
                  <span className="block truncate text-stone-800">{date.primary}</span>
                  {date.secondary ? (
                    <span className="mt-0.5 block truncate text-[10px] text-stone-500">
                      {date.secondary}
                    </span>
                  ) : null}
                </td>
                {mine ? (
                  <td className="px-3 py-2.5">
                    <TierListActions item={item} />
                  </td>
                ) : null}
              </tr>
            )
          })}
        </tbody>
      </table>

      <div className="md:hidden">
        {items.map((item) => {
          const date = catalogDate(item, mine)
          const href = tierListHref(item, mine)

          return (
            <article
              key={item.id}
              className="border-b border-stone-300/60 px-2 py-3 last:border-b-0"
            >
              <div className="flex items-center justify-between gap-3">
                <div className="min-w-0 flex-1">
                  <Link
                    href={href}
                    className="block truncate text-sm font-semibold text-stone-950"
                  >
                    {item.title}
                  </Link>
                  <p className="mt-2 text-xs text-stone-600">
                    {date.primary}
                    {date.secondary ? (
                      <span className="mt-0.5 block text-[10px] text-stone-500">
                        {date.secondary}
                      </span>
                    ) : null}
                  </p>
                </div>
                {mine ? (
                  <div className="flex shrink-0 items-center gap-2">
                    {statusBadge(item)}
                    <TierListActions item={item} />
                  </div>
                ) : (
                  <div className="min-w-0 max-w-[46%] shrink-0 overflow-hidden [&>span]:max-w-full">
                    <AuthorCell item={item} />
                  </div>
                )}
              </div>
            </article>
          )
        })}
      </div>
    </div>
  )
}
