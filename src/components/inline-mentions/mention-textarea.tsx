"use client"

import { useEffect, useId, useRef, useState } from "react"
import { Loader2 } from "lucide-react"

import { Textarea } from "@/components/ui/form"
import { ImageWithFallback } from "@/components/ui/image-with-fallback"
import {
  serializeInlineEntity,
  type MentionSuggestion,
} from "@/lib/inline-mentions/markup"
import { getMentionTriggerConfig } from "@/lib/inline-mentions/registry"

const SEARCH_DEBOUNCE_MS = 250
const MIN_QUERY_LENGTH = 2
const QUERY_TERMINATORS = new Set(["\n", "\r", ".", ",", ";", ":", "!", "?", ")", "]", "}"])
const TRIGGER_BOUNDARY = /[\s([{\u2014\u2013"'«]/u

export type ActiveMentionQuery = {
  end: number
  query: string
  start: number
  trigger: string
}

function isInsideMarker(value: string, caret: number) {
  const lastOpen = value.lastIndexOf("[[", caret - 1)
  const lastClose = value.lastIndexOf("]]", caret - 1)

  return lastOpen > lastClose
}

export function findActiveMentionQuery(
  value: string,
  selectionStart: number,
  selectionEnd: number,
): ActiveMentionQuery | null {
  if (selectionStart !== selectionEnd || isInsideMarker(value, selectionStart)) {
    return null
  }

  for (let index = selectionStart - 1; index >= 0; index -= 1) {
    const character = value[index]

    if (QUERY_TERMINATORS.has(character) || character === "[") {
      return null
    }

    const triggerConfig = getMentionTriggerConfig(character)
    if (!triggerConfig) {
      continue
    }

    const previousCharacter = index > 0 ? value[index - 1] : null
    if (previousCharacter && !TRIGGER_BOUNDARY.test(previousCharacter)) {
      return null
    }

    const query = value.slice(index + 1, selectionStart)
    if (query.includes("@") || query.includes("[[") || query.includes("]]")) {
      return null
    }

    return {
      end: selectionStart,
      query,
      start: index,
      trigger: triggerConfig.trigger,
    }
  }

  return null
}

type MentionTextareaProps = Omit<
  React.TextareaHTMLAttributes<HTMLTextAreaElement>,
  "onChange" | "value"
> & {
  onValueChange: (value: string) => void
  value: string
}

export function MentionTextarea({
  onValueChange,
  value,
  ...textareaProps
}: MentionTextareaProps) {
  const listboxId = useId()
  const containerRef = useRef<HTMLDivElement>(null)
  const textareaRef = useRef<HTMLTextAreaElement>(null)
  const pendingCaretRef = useRef<number | null>(null)
  const activeQueryKeyRef = useRef<string | null>(null)
  const [activeQuery, setActiveQuery] = useState<ActiveMentionQuery | null>(null)
  const [activeIndex, setActiveIndex] = useState(0)
  const [suggestions, setSuggestions] = useState<MentionSuggestion[]>([])
  const [isLoading, setIsLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [isComposing, setIsComposing] = useState(false)
  const normalizedQuery = activeQuery?.query.trim() ?? ""
  const triggerConfig = activeQuery
    ? getMentionTriggerConfig(activeQuery.trigger)
    : null
  const isOpen = Boolean(activeQuery && normalizedQuery.length >= MIN_QUERY_LENGTH)

  function updateActiveQuery(textarea = textareaRef.current, ignoreComposition = false) {
    if (!textarea || (isComposing && !ignoreComposition)) return

    const nextQuery = findActiveMentionQuery(
      textarea.value,
      textarea.selectionStart,
      textarea.selectionEnd,
    )
    const nextQueryKey = nextQuery
      ? `${nextQuery.trigger}:${nextQuery.start}:${nextQuery.end}:${nextQuery.query}`
      : null
    if (nextQueryKey !== activeQueryKeyRef.current) {
      activeQueryKeyRef.current = nextQueryKey
      setSuggestions([])
      setError(null)
      setIsLoading(false)
    }
    setActiveQuery(nextQuery)
    setActiveIndex(0)
    if (!nextQuery || nextQuery.query.trim().length < MIN_QUERY_LENGTH) {
      activeQueryKeyRef.current = null
    }
  }

  useEffect(() => {
    const caret = pendingCaretRef.current
    const textarea = textareaRef.current
    if (caret === null || !textarea) return

    pendingCaretRef.current = null
    window.requestAnimationFrame(() => {
      textarea.focus()
      textarea.setSelectionRange(caret, caret)
      setActiveQuery(null)
    })
  }, [value])

  useEffect(() => {
    if (!isOpen || !activeQuery || !triggerConfig) return

    const controller = new AbortController()
    const requestQueryKey = activeQueryKeyRef.current
    const timeoutId = window.setTimeout(async () => {
      setIsLoading(true)
      setError(null)

      try {
        const params = new URLSearchParams({
          q: normalizedQuery,
          trigger: activeQuery.trigger,
        })
        const response = await fetch(`${triggerConfig.searchEndpoint}?${params}`, {
          signal: controller.signal,
        })
        if (activeQueryKeyRef.current !== requestQueryKey) return

        if (!response.ok) {
          setSuggestions([])
          setError(
            response.status === 401
              ? "Сессия истекла. Обновите страницу и войдите снова."
              : "Не удалось найти записи. Попробуйте ещё раз.",
          )
          return
        }

        const payload = (await response.json()) as { items: MentionSuggestion[] }
        if (activeQueryKeyRef.current !== requestQueryKey) return
        setSuggestions(payload.items)
        setActiveIndex(0)
      } catch (requestError) {
        if (
          activeQueryKeyRef.current === requestQueryKey
          && !(requestError instanceof DOMException && requestError.name === "AbortError")
        ) {
          setSuggestions([])
          setError("Не удалось найти записи. Попробуйте ещё раз.")
        }
      } finally {
        if (!controller.signal.aborted) setIsLoading(false)
      }
    }, SEARCH_DEBOUNCE_MS)

    return () => {
      controller.abort()
      window.clearTimeout(timeoutId)
    }
  }, [activeQuery, isOpen, normalizedQuery, triggerConfig])

  useEffect(() => {
    function closeOnOutsidePointer(event: PointerEvent) {
      if (!containerRef.current?.contains(event.target as Node)) {
        setActiveQuery(null)
      }
    }

    document.addEventListener("pointerdown", closeOnOutsidePointer)
    return () => document.removeEventListener("pointerdown", closeOnOutsidePointer)
  }, [])

  function selectSuggestion(suggestion: MentionSuggestion) {
    if (!activeQuery) return

    const marker = serializeInlineEntity({
      type: suggestion.type,
      id: suggestion.id,
      label: suggestion.label,
    })
    const nextValue = `${value.slice(0, activeQuery.start)}${marker}${value.slice(activeQuery.end)}`
    if (
      typeof textareaProps.maxLength === "number"
      && nextValue.length > textareaProps.maxLength
    ) {
      setError("Недостаточно места, чтобы вставить упоминание.")
      return
    }
    pendingCaretRef.current = activeQuery.start + marker.length
    setSuggestions([])
    setActiveQuery(null)
    onValueChange(nextValue)
  }

  function handleKeyDown(event: React.KeyboardEvent<HTMLTextAreaElement>) {
    textareaProps.onKeyDown?.(event)
    if (event.defaultPrevented || !isOpen) return

    if (event.key === "Escape") {
      event.preventDefault()
      setActiveQuery(null)
      return
    }

    if (suggestions.length === 0) return

    if (event.key === "ArrowDown" || event.key === "ArrowUp") {
      event.preventDefault()
      const direction = event.key === "ArrowDown" ? 1 : -1
      setActiveIndex((currentIndex) =>
        (currentIndex + direction + suggestions.length) % suggestions.length,
      )
      return
    }

    if (event.key === "Enter" || event.key === "Tab") {
      event.preventDefault()
      selectSuggestion(suggestions[activeIndex])
    }
  }

  return (
    <div ref={containerRef} className="relative">
      <Textarea
        {...textareaProps}
        ref={textareaRef}
        value={value}
        aria-activedescendant={
          isOpen && suggestions[activeIndex]
            ? `${listboxId}-option-${activeIndex}`
            : undefined
        }
        aria-controls={isOpen ? listboxId : undefined}
        aria-expanded={isOpen}
        aria-haspopup="listbox"
        onChange={(event) => {
          onValueChange(event.currentTarget.value)
          updateActiveQuery(event.currentTarget)
        }}
        onBlur={(event) => {
          textareaProps.onBlur?.(event)
          const nextTarget = event.relatedTarget
          if (!(nextTarget instanceof Node) || !containerRef.current?.contains(nextTarget)) {
            setActiveQuery(null)
          }
        }}
        onClick={() => updateActiveQuery()}
        onCompositionEnd={() => {
          setIsComposing(false)
          updateActiveQuery(textareaRef.current, true)
        }}
        onCompositionStart={() => setIsComposing(true)}
        onFocus={() => updateActiveQuery()}
        onKeyDown={handleKeyDown}
        onKeyUp={(event) => {
          textareaProps.onKeyUp?.(event)
          if (!["ArrowDown", "ArrowUp", "Enter", "Tab", "Escape"].includes(event.key)) {
            updateActiveQuery()
          }
        }}
        onSelect={() => updateActiveQuery()}
      />

      {isOpen ? (
        <div className="relative z-40 mt-1 max-h-72 w-full overflow-y-auto rounded-md border border-stone-200 bg-white shadow-lg">
          {error ? (
            <p className="px-3 py-2 text-sm text-stone-600">{error}</p>
          ) : isLoading ? (
            <p className="flex items-center gap-2 px-3 py-2 text-sm text-stone-500">
              <Loader2 className="size-4 animate-spin" aria-hidden="true" />
              Ищем…
            </p>
          ) : suggestions.length === 0 ? (
            <p className="px-3 py-2 text-sm text-stone-600">Ничего не найдено.</p>
          ) : (
            <ul id={listboxId} role="listbox" aria-label="Результаты поиска упоминаний">
              {suggestions.map((suggestion, index) => (
                <li
                  id={`${listboxId}-option-${index}`}
                  key={`${suggestion.type}:${suggestion.id}`}
                  role="option"
                  aria-selected={index === activeIndex}
                >
                  <button
                    type="button"
                    className={`flex w-full items-center gap-3 px-3 py-2 text-left transition-colors ${
                      index === activeIndex ? "bg-stone-100" : "hover:bg-stone-50"
                    }`}
                    onMouseDown={(event) => event.preventDefault()}
                    onMouseEnter={() => setActiveIndex(index)}
                    onClick={() => selectSuggestion(suggestion)}
                  >
                    <span className="grid size-10 shrink-0 place-items-center overflow-hidden rounded bg-stone-100 text-xs text-stone-400">
                      <ImageWithFallback
                        src={suggestion.image}
                        alt=""
                        className="h-full w-full object-cover"
                        fallback={<span aria-hidden="true">—</span>}
                      />
                    </span>
                    <span className="min-w-0">
                      <span className="block truncate text-sm font-medium text-stone-950">
                        {suggestion.label}
                      </span>
                      {suggestion.subtitle ? (
                        <span className="mt-0.5 block truncate text-xs text-stone-500">
                          {suggestion.subtitle}
                        </span>
                      ) : null}
                    </span>
                  </button>
                </li>
              ))}
            </ul>
          )}
        </div>
      ) : null}
    </div>
  )
}
