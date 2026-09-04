"use client"

import { Search } from "lucide-react"
import { useCallback, useTransition } from "react"
import { usePathname, useRouter, useSearchParams } from "next/navigation"

import { ArchiveSelect } from "@/components/ui/archive-select"
import { useDebouncedSearchDraft } from "@/lib/common/use-debounced-search-draft"
import type { MediaTypeOption } from "@/lib/media/types"
import {
  REVIEW_CATALOG_PRESET_LABELS,
  REVIEW_CATALOG_PRESETS,
  REVIEW_CATALOG_SCORE_FILTER_LABELS,
  REVIEW_CATALOG_SCORE_FILTERS,
  type ReviewCatalogPreset,
  type ReviewCatalogScoreFilter,
} from "./reviews-catalog-logic"

type ReviewsCatalogControlsProps = {
  authors: readonly { id: number; name: string }[]
  authorId: number | null
  currentAuthorId: number | null
  mediaType: string
  mediaTypes: readonly MediaTypeOption[]
  preset: ReviewCatalogPreset
  scoreFilter: ReviewCatalogScoreFilter
  searchQuery: string
}

export function ReviewsCatalogControls({
  authors,
  authorId,
  currentAuthorId,
  mediaType,
  mediaTypes,
  preset,
  scoreFilter,
  searchQuery,
}: ReviewsCatalogControlsProps) {
  const pathname = usePathname()
  const router = useRouter()
  const searchParams = useSearchParams()
  const [, startTransition] = useTransition()

  const replaceParams = useCallback(
    (mutate: (params: URLSearchParams) => void) => {
      const nextSearchParams = new URLSearchParams(searchParams.toString())
      mutate(nextSearchParams)
      nextSearchParams.delete("page")
      const queryString = nextSearchParams.toString()

      if (queryString === searchParams.toString()) {
        return
      }

      startTransition(() => {
        router.replace(queryString ? `${pathname}?${queryString}` : pathname, {
          scroll: false,
        })
      })
    },
    [pathname, router, searchParams],
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
        if (normalizedQuery) {
          params.set("q", normalizedQuery)
        } else {
          params.delete("q")
        }
      })
    },
    [replaceParams, router, searchParams, searchQuery],
  )

  const { draft, setDraft } = useDebouncedSearchDraft({
    searchQuery,
    onSearch: handleSearch,
  })

  const mediaTypeOptions = [
    { label: "Все типы", value: "all" },
    ...mediaTypes.map((item) => ({ label: item.name, value: item.code })),
  ]
  const authorOptions = [
    { label: "Все авторы", value: "all" },
    ...(currentAuthorId === null
      ? []
      : [{ label: "Я", value: String(currentAuthorId) }]),
    ...authors
      .filter((author) => author.id !== currentAuthorId)
      .map((author) => ({ label: author.name, value: String(author.id) })),
  ]
  const scoreOptions = REVIEW_CATALOG_SCORE_FILTERS.map((value) => ({
    label: REVIEW_CATALOG_SCORE_FILTER_LABELS[value],
    value,
  }))

  return (
    <div className="mt-6 space-y-3">
      <div className="flex flex-col gap-2 lg:flex-row lg:items-center">
        <label className="sr-only" htmlFor="reviews-search">
          Поиск рецензий по названию записи
        </label>
        <div className="relative min-w-0 flex-1">
          <Search
            aria-hidden="true"
            className="pointer-events-none absolute left-3 top-1/2 size-4 -translate-y-1/2 text-stone-400"
          />
          <input
            className="h-10 w-full rounded-md border border-stone-300/80 bg-stone-50/70 pl-10 pr-3 font-mono text-sm text-stone-900 outline-none transition-colors placeholder:text-stone-400 focus:border-stone-950"
            id="reviews-search"
            name="q"
            onChange={(event) => setDraft(event.target.value)}
            placeholder="Поиск по названию записи..."
            type="search"
            value={draft}
          />
        </div>
        <div className="grid grid-cols-1 gap-2 sm:grid-cols-3 lg:w-auto lg:min-w-[28rem]">
          <ArchiveSelect
            ariaLabel="Тип записи"
            className="w-full"
            triggerClassName="w-full min-w-0"
            onChange={(value) => {
              replaceParams((params) => {
                if (value === "all") {
                  params.delete("type")
                } else {
                  params.set("type", value)
                }
              })
            }}
            options={mediaTypeOptions}
            value={mediaType}
          />
          <ArchiveSelect
            ariaLabel="Оценка автора"
            className="w-full"
            triggerClassName="w-full min-w-0"
            onChange={(value) => {
              replaceParams((params) => {
                if (value === "all") {
                  params.delete("score")
                } else {
                  params.set("score", value)
                }
              })
            }}
            options={scoreOptions}
            value={scoreFilter}
          />
          <ArchiveSelect
            ariaLabel="Автор рецензии"
            className="w-full"
            triggerClassName="w-full min-w-0"
            onChange={(value) => {
              replaceParams((params) => {
                if (value === "all") {
                  params.delete("author")
                } else {
                  params.set("author", value)
                }
              })
            }}
            options={authorOptions}
            value={authorId ? String(authorId) : "all"}
          />
        </div>
      </div>

      <nav aria-label="Пресеты рецензий" className="flex flex-wrap gap-1.5">
        {REVIEW_CATALOG_PRESETS.map((value) => {
          const selected = preset === value

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
                  if (value === "all") {
                    params.delete("preset")
                  } else {
                    params.set("preset", value)
                  }
                })
              }}
            >
              {REVIEW_CATALOG_PRESET_LABELS[value]}
            </button>
          )
        })}
      </nav>
    </div>
  )
}
