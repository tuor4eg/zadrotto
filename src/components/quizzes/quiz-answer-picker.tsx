"use client"

import { useEffect, useState } from "react"
import { Search, X } from "lucide-react"

import { Input } from "@/components/ui/form"
import { isQuizMediaTypeAllowed } from "@/lib/quizzes/model"
import type { MediaTypeOption } from "@/lib/media/types"

export type QuizAnswerItem = {
  id: number
  title: string
  originalTitle: string | null
  releaseYear: number | null
  mediaType: string
  mediaTypeName?: string
}
type Item = QuizAnswerItem;

export function QuizAnswerPicker({
  allowedMediaTypes,
  initial,
  mediaTypes,
  onSelect,
  searchUrl = "/api/admin/quizzes/title-search",
  disabled = false,
  inputName = "answerMediaItemId",
  showSelectionSummary = true,
}: {
  allowedMediaTypes: readonly string[]
  initial?: Item | null
  mediaTypes: readonly MediaTypeOption[]
  onSelect?: (item: Item | null) => void
  searchUrl?: string
  disabled?: boolean
  inputName?: string
  showSelectionSummary?: boolean
}) {
  const [query, setQuery] = useState(initial?.title ?? "")
  const [items, setItems] = useState<Item[]>(initial ? [initial] : [])
  const [selected, setSelected] = useState(initial ?? null)
  const [resultQuery, setResultQuery] = useState("")
  const [searchError, setSearchError] = useState(false);
  const [resultTypes, setResultTypes] = useState("")
  const allowedKey = [...allowedMediaTypes].sort().join(",")

  if (selected && !isQuizMediaTypeAllowed(allowedMediaTypes, selected.mediaType)) {
    setSelected(null)
    setQuery("")
    setItems([])
    setResultQuery("")
    setResultTypes("")
  }

  function mediaTypeName(mediaType: string) {
    return items.find((item) => item.mediaType === mediaType && item.mediaTypeName)?.mediaTypeName ?? mediaTypes.find((type) => type.code === mediaType)?.name ?? mediaType
  }

  useEffect(() => {
    const normalizedQuery = query.trim()

    if (normalizedQuery.length < 2 || normalizedQuery === selected?.title) {
      return
    }

    const controller = new AbortController()
    const timer = window.setTimeout(() => {
      setSearchError(false);
      const params = new URLSearchParams({ q: normalizedQuery })
      for (const mediaType of allowedMediaTypes) {
        params.append("mediaType", mediaType)
      }
      void fetch(`${searchUrl}?${params}`, {
        signal: controller.signal,
      })
        .then(async (response) => {
          if (controller.signal.aborted) return
          if (!response.ok) throw new Error("quiz-search-unavailable")
          const payload = await response.json() as { items?: Item[] }
          if (controller.signal.aborted) return
          setItems(payload.items ?? [])
          setResultQuery(normalizedQuery)
          setResultTypes(allowedKey)
        })
        .catch((error: unknown) => {
          if (controller.signal.aborted || (error instanceof DOMException && error.name === "AbortError")) {
            return
          }
          console.error("Не удалось найти записи для квиза.", error)
          setSearchError(true);
          setItems([])
          setResultQuery(normalizedQuery)
          setResultTypes(allowedKey)
        })
    }, 250)

    return () => {
      window.clearTimeout(timer)
      controller.abort()
    }
  }, [allowedKey, allowedMediaTypes, query, selected, searchUrl])

  const normalizedQuery = query.trim()
  const isSearchOpen = normalizedQuery.length >= 2 && !selected
  const resultsAreCurrent = resultQuery === normalizedQuery && resultTypes === allowedKey


  return (
    <div className="grid gap-2">
      <input type="hidden" name={inputName} value={selected?.id ?? ""} />
      <div className="relative">
        <Search aria-hidden="true" className="pointer-events-none absolute left-3 top-1/2 size-4 -translate-y-1/2 text-stone-400" />
        <Input
          className="pl-10 pr-10 [&::-webkit-search-cancel-button]:appearance-none"
          type="search"
          autoComplete="off"
          value={query}
          disabled={disabled}
          aria-label="Поиск записи по названию"
          onChange={(event) => {
            setQuery(event.target.value)
            setSelected(null)
            onSelect?.(null)
          }}
          placeholder="Введите название произведения"
        />
        {query.length > 0 ? (
          <button
            type="button"
            aria-label="Очистить поиск записи"
            disabled={disabled}
            className="absolute right-1 top-1/2 grid size-8 -translate-y-1/2 place-items-center rounded-md text-stone-500 transition-colors hover:bg-stone-100 hover:text-stone-950 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-stone-400 disabled:cursor-not-allowed disabled:opacity-50"
            onClick={(event) => {
              setQuery("")
              setSelected(null)
              setItems([])
              setResultQuery("")
              setResultTypes("")
              setSearchError(false)
              onSelect?.(null)
              event.currentTarget.parentElement?.querySelector("input")?.focus()
            }}
          >
            <X aria-hidden="true" className="size-4" />
          </button>
        ) : null}
      {isSearchOpen ? (
        <div className="absolute inset-x-0 top-full z-[120] mt-1 max-h-52 overflow-auto rounded-md border bg-white p-1 shadow-lg">
          {!resultsAreCurrent ? (
            <p className="px-3 py-2 text-sm text-stone-500">Ищем…</p>
          ) : searchError ? (
            <p role="alert" className="px-3 py-2 text-sm text-red-800">Не удалось найти записи. Попробуйте изменить запрос.</p>
          ) : items.length === 0 ? (
            <p className="px-3 py-2 text-sm text-stone-500">Ничего не найдено</p>
          ) : (
            items.map((item) => (
              <button
                className="block w-full rounded px-3 py-2 text-left text-sm hover:bg-stone-100"
                type="button"
                disabled={disabled}
                key={item.id}
                onClick={() => {
                  setSelected(item)
                  setQuery(item.title)
                  onSelect?.(item)
                }}
              >
                {item.title}{item.releaseYear ? ` (${item.releaseYear})` : ""} · {mediaTypeName(item.mediaType)}
              </button>
            ))
          )}
        </div>
      ) : null}
      </div>
      {selected && showSelectionSummary ? (
        <p className="text-xs text-stone-600">
          Выбрана: {selected.title} · {mediaTypeName(selected.mediaType)}
        </p>
      ) : null}
    </div>
  )
}
