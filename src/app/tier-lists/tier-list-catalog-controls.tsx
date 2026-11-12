"use client"

import { Search } from "lucide-react"
import { useCallback, useTransition } from "react"
import { usePathname, useRouter, useSearchParams } from "next/navigation"

import { ArchiveSelect } from "@/components/ui/archive-select"
import { useDebouncedSearchDraft } from "@/lib/common/use-debounced-search-draft"

import {
  TIER_LIST_CATALOG_SORTS,
  TIER_LIST_CATALOG_SORT_LABELS,
  TIER_LIST_MINE_STATUSES,
  TIER_LIST_MINE_STATUS_LABELS,
  type TierListCatalogSort,
  type TierListMineStatus,
} from "./tier-list-catalog-logic"

type TierListCatalogControlsProps = {
  authors: readonly { id: number; name: string }[]
  authorId: number | null
  currentAuthorId: number | null
  searchQuery: string
  sort: TierListCatalogSort
  status: TierListMineStatus
  statusCounts: Readonly<Record<TierListMineStatus, number>> | null
  view: "all" | "mine"
}

export function TierListCatalogControls({
  authors,
  authorId,
  currentAuthorId,
  searchQuery,
  sort,
  status,
  statusCounts,
  view,
}: TierListCatalogControlsProps) {
  const pathname = usePathname()
  const router = useRouter()
  const searchParams = useSearchParams()
  const [, startTransition] = useTransition()

  const replaceParams = useCallback(
    (mutate: (params: URLSearchParams) => void) => {
      const nextSearchParams = new URLSearchParams(searchParams.toString())
      mutate(nextSearchParams)
      nextSearchParams.delete("page")
      nextSearchParams.delete("mine")
      if (view === "mine") nextSearchParams.set("view", "mine")
      const queryString = nextSearchParams.toString()

      if (queryString === searchParams.toString()) return

      startTransition(() => {
        router.replace(queryString ? `${pathname}?${queryString}` : pathname, {
          scroll: false,
        })
      })
    },
    [pathname, router, searchParams, view],
  )

  const handleSearch = useCallback(
    (query: string) => {
      const normalizedQuery = query.trim()
      const currentUrlQuery = searchParams.get("q")?.trim() ?? ""

      if (normalizedQuery === currentUrlQuery && normalizedQuery !== searchQuery) {
        startTransition(() => {
          router.refresh()
        })
        return
      }

      replaceParams((params) => {
        if (normalizedQuery) params.set("q", normalizedQuery)
        else params.delete("q")
      })
    },
    [replaceParams, router, searchParams, searchQuery],
  )

  const { draft, setDraft } = useDebouncedSearchDraft({
    searchQuery,
    onSearch: handleSearch,
  })

  const authorOptions = [
    { label: "Все авторы", value: "all" },
    ...(currentAuthorId === null ? [] : [{ label: "Я", value: String(currentAuthorId) }]),
    ...authors
      .filter((author) => author.id !== currentAuthorId)
      .map((author) => ({ label: author.name, value: String(author.id) })),
  ]
  if (authorId && !authorOptions.some((option) => option.value === String(authorId))) {
    authorOptions.push({ label: "Выбранный автор", value: String(authorId) })
  }

  const sortOptions = TIER_LIST_CATALOG_SORTS.map((value) => ({
    label: TIER_LIST_CATALOG_SORT_LABELS[value],
    value,
  }))

  return (
    <div className="mt-6 space-y-3">
      <div className="flex flex-col gap-2 lg:flex-row lg:items-center">
        <label className="sr-only" htmlFor="tier-lists-search">
          Поиск тир-листов по названию
        </label>
        <div className="relative min-w-0 flex-1">
          <Search
            aria-hidden="true"
            className="pointer-events-none absolute left-3 top-1/2 size-4 -translate-y-1/2 text-stone-400"
          />
          <input
            className="h-10 w-full rounded-md border border-stone-300/80 bg-stone-50/70 pl-10 pr-3 font-mono text-sm text-stone-900 outline-none transition-colors placeholder:text-stone-400 focus:border-stone-950"
            id="tier-lists-search"
            maxLength={200}
            name="q"
            onChange={(event) => setDraft(event.target.value)}
            placeholder="Поиск тир-листов по названию"
            type="search"
            value={draft}
          />
        </div>
        <div
          className={`grid grid-cols-1 gap-2 lg:w-auto ${
            view === "all" ? "sm:grid-cols-2 lg:min-w-[22rem]" : "lg:min-w-[12rem]"
          }`}
        >
          {view === "all" ? (
            <ArchiveSelect
              ariaLabel="Автор тир-листа"
              className="w-full"
              triggerClassName="h-10 w-full min-w-0"
              onChange={(value) => {
                replaceParams((params) => {
                  if (value === "all") params.delete("author")
                  else params.set("author", value)
                })
              }}
              options={authorOptions}
              value={authorId ? String(authorId) : "all"}
            />
          ) : null}
          <ArchiveSelect
            ariaLabel="Сортировка"
            className="w-full"
            triggerClassName="h-10 w-full min-w-0"
            onChange={(value) => {
              replaceParams((params) => {
                if (value === "newest") params.delete("sort")
                else params.set("sort", value)
              })
            }}
            options={sortOptions}
            value={sort}
          />
        </div>
      </div>

      {view === "mine" && statusCounts ? (
        <nav aria-label="Статус тир-листа" className="flex flex-wrap gap-1.5">
          {TIER_LIST_MINE_STATUSES.map((value) => {
            const selected = status === value

            return (
              <button
                key={value}
                type="button"
                aria-current={selected ? "page" : undefined}
                className={`rounded border px-3 py-1.5 font-mono text-xs transition-colors ${
                  selected
                    ? "border-stone-950 bg-stone-900 text-stone-50"
                    : "border-stone-300/80 bg-stone-50/60 text-stone-700 hover:border-stone-600"
                }`}
                onClick={() => {
                  replaceParams((params) => {
                    if (value === "all") params.delete("status")
                    else params.set("status", value)
                  })
                }}
              >
                {TIER_LIST_MINE_STATUS_LABELS[value]}
                <span className="ml-1.5 tabular-nums opacity-70">{statusCounts[value]}</span>
              </button>
            )
          })}
        </nav>
      ) : null}
    </div>
  )
}
