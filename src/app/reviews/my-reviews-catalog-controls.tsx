"use client"

import { useCallback, useTransition } from "react"
import { usePathname, useRouter, useSearchParams } from "next/navigation"

import { ArchiveSelect } from "@/components/ui/archive-select"
import type { MediaTypeOption } from "@/lib/media/types"

import {
  MY_REVIEW_STATUS_FILTER_LABELS,
  MY_REVIEW_STATUS_FILTERS,
  type MyReviewStatusFilter,
} from "./reviews-catalog-logic"

type MyReviewsCatalogControlsProps = {
  mediaType: string
  mediaTypes: readonly MediaTypeOption[]
  status: MyReviewStatusFilter
  statusCounts: Readonly<Record<MyReviewStatusFilter, number>>
}

export function MyReviewsCatalogControls({
  mediaType,
  mediaTypes,
  status,
  statusCounts,
}: MyReviewsCatalogControlsProps) {
  const pathname = usePathname()
  const router = useRouter()
  const searchParams = useSearchParams()
  const [, startTransition] = useTransition()

  const replaceParams = useCallback(
    (mutate: (params: URLSearchParams) => void) => {
      const nextSearchParams = new URLSearchParams(searchParams.toString())
      mutate(nextSearchParams)
      nextSearchParams.set("view", "mine")
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

  const mediaTypeOptions = [
    { label: "Все типы", value: "all" },
    ...mediaTypes.map((item) => ({ label: item.name, value: item.code })),
  ]

  return (
    <div className="mt-6 space-y-3">
      <nav aria-label="Статус рецензии" className="flex flex-wrap gap-1.5">
        {MY_REVIEW_STATUS_FILTERS.map((value) => {
          const selected = status === value
          const count = statusCounts[value]

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
                    params.delete("status")
                  } else {
                    params.set("status", value)
                  }
                })
              }}
            >
              {MY_REVIEW_STATUS_FILTER_LABELS[value]} ({count})
            </button>
          )
        })}
      </nav>

      {mediaTypes.length >= 2 ? (
        <ArchiveSelect
          ariaLabel="Тип записи"
          className="w-full sm:max-w-[14rem]"
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
      ) : null}
    </div>
  )
}
