"use client"

import { useEffect, useState } from "react"

import { isQuizMediaTypeAllowed } from "@/lib/quizzes/model"
import type { MediaTypeOption } from "@/lib/media/types"

type Item = {
  id: number
  title: string
  originalTitle: string | null
  releaseYear: number | null
  mediaType: string
}

export function QuizAnswerPicker({
  allowedMediaTypes,
  initial,
  mediaTypes,
}: {
  allowedMediaTypes: readonly string[]
  initial?: Item | null
  mediaTypes: readonly MediaTypeOption[]
}) {
  const [query, setQuery] = useState(initial?.title ?? "")
  const [items, setItems] = useState<Item[]>(initial ? [initial] : [])
  const [selected, setSelected] = useState(initial ?? null)
  const [resultQuery, setResultQuery] = useState("")
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
    return mediaTypes.find((type) => type.code === mediaType)?.name ?? mediaType
  }

  useEffect(() => {
    const normalizedQuery = query.trim()

    if (normalizedQuery.length < 2 || normalizedQuery === selected?.title) {
      return
    }

    const controller = new AbortController()
    const timer = window.setTimeout(() => {
      const params = new URLSearchParams({ q: normalizedQuery })
      for (const mediaType of allowedMediaTypes) {
        params.append("mediaType", mediaType)
      }
      void fetch(`/api/admin/quizzes/title-search?${params}`, {
        signal: controller.signal,
      })
        .then(async (response) => {
          if (!response.ok || controller.signal.aborted) return
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
          setItems([])
          setResultQuery(normalizedQuery)
          setResultTypes(allowedKey)
        })
    }, 250)

    return () => {
      window.clearTimeout(timer)
      controller.abort()
    }
  }, [allowedKey, allowedMediaTypes, query, selected])

  const normalizedQuery = query.trim()
  const isSearchOpen = normalizedQuery.length >= 2 && !selected
  const resultsAreCurrent = resultQuery === normalizedQuery && resultTypes === allowedKey

  return (
    <div className="grid gap-2">
      <input type="hidden" name="answerMediaItemId" value={selected?.id ?? ""} />
      <input
        className="h-10 rounded-md border border-stone-300 px-3"
        value={query}
        onChange={(event) => {
          setQuery(event.target.value)
          setSelected(null)
        }}
        placeholder="Начните вводить название записи"
      />
      {isSearchOpen ? (
        <div className="max-h-52 overflow-auto rounded-md border bg-white p-1">
          {!resultsAreCurrent ? (
            <p className="px-3 py-2 text-sm text-stone-500">Ищем…</p>
          ) : items.length === 0 ? (
            <p className="px-3 py-2 text-sm text-stone-500">Ничего не найдено</p>
          ) : (
            items.map((item) => (
              <button
                className="block w-full rounded px-3 py-2 text-left text-sm hover:bg-stone-100"
                type="button"
                key={item.id}
                onClick={() => {
                  setSelected(item)
                  setQuery(item.title)
                }}
              >
                {item.title}{item.releaseYear ? ` (${item.releaseYear})` : ""} · {mediaTypeName(item.mediaType)}
              </button>
            ))
          )}
        </div>
      ) : null}
      {selected ? (
        <p className="text-xs text-stone-600">
          Выбрана: {selected.title} · {mediaTypeName(selected.mediaType)}
        </p>
      ) : null}
    </div>
  )
}
