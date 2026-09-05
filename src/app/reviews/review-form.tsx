"use client"

import { useActionState, useEffect, useRef, useState } from "react"
import { useRouter } from "next/navigation"
import { Loader2, Search } from "lucide-react"

import { ArchiveToasts } from "@/components/ui/archive-toasts"
import { Button } from "@/components/ui/button"
import { Input, Label, Textarea } from "@/components/ui/form"
import {
  REVIEW_BODY_MAX_LENGTH,
  REVIEW_TITLE_MAX_LENGTH,
} from "@/lib/forms/contribution-review"
import type { ContributionStatus } from "@/lib/contributions/model"
import { getMediaTypeLabel, type MediaTypeOption } from "@/lib/media/types"

import { savePublicReviewAction, type SavePublicReviewState } from "./actions"

type MediaSearchItem = {
  id: number
  code: string
  title: string
  originalTitle: string | null
  mediaType: string
  releaseYear: number | null
  existingReviewId: number | null
}

type SelectedMediaItem = {
  id: number
  title: string
}

type PublicReviewFormProps = {
  canPublishWithoutReview?: boolean
  contributionId?: number
  mediaItem?: SelectedMediaItem | null
  mediaItemLocked?: boolean
  mediaTypes?: readonly MediaTypeOption[]
  status?: ContributionStatus
  values?: {
    title: string
    body: string
  }
}

function formatMediaSearchMeta(
  item: MediaSearchItem,
  mediaTypes: readonly MediaTypeOption[],
) {
  return [
    item.originalTitle,
    getMediaTypeLabel(item.mediaType, mediaTypes),
    item.releaseYear,
  ]
    .filter(Boolean)
    .join(" · ")
}

export function PublicReviewForm({
  canPublishWithoutReview = false,
  contributionId,
  mediaItem = null,
  mediaItemLocked = Boolean(contributionId),
  mediaTypes = [],
  status,
  values,
}: PublicReviewFormProps) {
  const router = useRouter()
  const isExistingReview = Boolean(contributionId)
  const canSaveDraft = !isExistingReview || status === "draft"
  const isPublishedReview = status === "published"
  const submitLabel = canPublishWithoutReview
    ? isExistingReview
      ? "Опубликовать изменения"
      : "Опубликовать"
    : isExistingReview
      ? "Отправить на повторную проверку"
      : "Отправить на проверку"
  const [isConfirmOpen, setIsConfirmOpen] = useState(false)
  const [selectedMedia, setSelectedMedia] = useState<SelectedMediaItem | null>(mediaItem)
  const [mediaQuery, setMediaQuery] = useState(mediaItem?.title ?? "")
  const [searchItems, setSearchItems] = useState<MediaSearchItem[]>([])
  const [searchOpen, setSearchOpen] = useState(false)
  const [searchLoading, setSearchLoading] = useState(false)
  const [searchError, setSearchError] = useState<string | null>(null)
  const formRef = useRef<HTMLFormElement>(null)
  const mediaPickerRef = useRef<HTMLDivElement>(null)
  const isConfirmedSubmitRef = useRef(false)
  const initialState: SavePublicReviewState = {
    error: null,
    values: {
      title: values?.title ?? "",
      body: values?.body ?? "",
    },
  }
  const [state, formAction, isPending] = useActionState(savePublicReviewAction, initialState)

  useEffect(() => {
    function handlePointerDown(event: PointerEvent) {
      if (!mediaPickerRef.current?.contains(event.target as Node)) {
        setSearchOpen(false)
      }
    }

    function handleKeyDown(event: KeyboardEvent) {
      if (event.key === "Escape") {
        setSearchOpen(false)
      }
    }

    document.addEventListener("pointerdown", handlePointerDown)
    document.addEventListener("keydown", handleKeyDown)

    return () => {
      document.removeEventListener("pointerdown", handlePointerDown)
      document.removeEventListener("keydown", handleKeyDown)
    }
  }, [])

  useEffect(() => {
    if (mediaItemLocked) {
      return
    }

    const normalizedQuery = mediaQuery.trim()

    if (normalizedQuery.length < 2 || normalizedQuery === selectedMedia?.title) {
      setSearchItems([])
      setSearchLoading(false)
      setSearchError(null)
      return
    }

    const controller = new AbortController()
    const timeoutId = window.setTimeout(async () => {
      setSearchLoading(true)
      setSearchError(null)

      try {
        const response = await fetch(
          `/api/reviews/media-search?q=${encodeURIComponent(normalizedQuery)}`,
          { signal: controller.signal },
        )

        if (!response.ok) {
          setSearchItems([])
          setSearchError(
            response.status === 401
              ? "Сессия истекла. Обновите страницу и войдите снова."
              : "Не удалось найти записи. Попробуйте ещё раз.",
          )
          return
        }

        const payload = (await response.json()) as { items: MediaSearchItem[] }
        setSearchItems(payload.items)
        setSearchOpen(true)
      } catch (error) {
        if (!(error instanceof DOMException && error.name === "AbortError")) {
          setSearchItems([])
          setSearchError("Не удалось найти записи. Попробуйте ещё раз.")
        }
      } finally {
        if (!controller.signal.aborted) {
          setSearchLoading(false)
        }
      }
    }, 250)

    return () => {
      controller.abort()
      window.clearTimeout(timeoutId)
    }
  }, [mediaItemLocked, mediaQuery, selectedMedia?.title])

  function handleSubmit(event: React.FormEvent<HTMLFormElement>) {
    if (!selectedMedia) {
      event.preventDefault()
      return
    }

    const submitter = (event.nativeEvent as SubmitEvent).submitter
    const intent = submitter instanceof HTMLButtonElement ? submitter.value : ""

    if (
      canPublishWithoutReview ||
      !isPublishedReview ||
      intent !== "submit" ||
      isConfirmedSubmitRef.current
    ) {
      isConfirmedSubmitRef.current = false

      return
    }

    event.preventDefault()
    setIsConfirmOpen(true)
  }

  function confirmPublishedReviewSubmit() {
    isConfirmedSubmitRef.current = true
    setIsConfirmOpen(false)
    const submitButton = formRef.current?.querySelector<HTMLButtonElement>(
      'button[name="intent"][value="submit"]',
    )

    formRef.current?.requestSubmit(submitButton)
  }

  function selectMediaItem(item: MediaSearchItem) {
    if (item.existingReviewId) {
      router.push(`/reviews/${item.existingReviewId}/edit`)
      return
    }

    setSelectedMedia({ id: item.id, title: item.title })
    setMediaQuery(item.title)
    setSearchItems([])
    setSearchOpen(false)
    setSearchError(null)
  }

  return (
    <form ref={formRef} action={formAction} className="grid gap-4" onSubmit={handleSubmit}>
      {contributionId ? (
        <input type="hidden" name="contributionId" value={contributionId} />
      ) : null}
      {selectedMedia ? (
        <input type="hidden" name="mediaItemId" value={selectedMedia.id} />
      ) : null}

      <ArchiveToasts
        messages={
          state.error
            ? [{ id: "review-form-error", tone: "error", text: state.error }]
            : []
        }
      />

      <div className="grid gap-2">
        <Label htmlFor="media-item-search">Запись архива</Label>
        {mediaItemLocked && selectedMedia ? (
          <div className="rounded-md border border-stone-200 bg-stone-50 px-3 py-2 text-sm text-stone-600">
            <span className="font-medium text-stone-950">{selectedMedia.title}</span>
          </div>
        ) : (
          <div ref={mediaPickerRef} className="relative">
            <Search
              aria-hidden="true"
              className="pointer-events-none absolute left-3 top-1/2 size-4 -translate-y-1/2 text-stone-400"
            />
            <Input
              id="media-item-search"
              value={mediaQuery}
              autoComplete="off"
              placeholder="Начните вводить название записи"
              className="pl-10"
              onChange={(event) => {
                const nextQuery = event.target.value
                setMediaQuery(nextQuery)

                if (selectedMedia && nextQuery !== selectedMedia.title) {
                  setSelectedMedia(null)
                }

                setSearchOpen(true)
              }}
              onFocus={() => {
                if (searchItems.length > 0 || searchError) {
                  setSearchOpen(true)
                }
              }}
            />
            {searchLoading ? (
              <Loader2
                aria-hidden="true"
                className="absolute right-3 top-1/2 size-4 -translate-y-1/2 animate-spin text-stone-400"
              />
            ) : null}

            {searchOpen && mediaQuery.trim().length >= 2 && mediaQuery.trim() !== selectedMedia?.title ? (
              <div className="absolute z-30 mt-1 max-h-64 w-full overflow-y-auto rounded-md border border-stone-200 bg-white shadow-lg">
                {searchError ? (
                  <p className="px-3 py-2 text-sm text-stone-600">{searchError}</p>
                ) : searchLoading ? (
                  <p className="px-3 py-2 text-sm text-stone-500">Ищем…</p>
                ) : searchItems.length === 0 ? (
                  <p className="px-3 py-2 text-sm text-stone-600">Ничего не найдено.</p>
                ) : (
                  <ul role="listbox" aria-label="Результаты поиска записей">
                    {searchItems.map((item) => (
                      <li key={item.id}>
                        <button
                          type="button"
                          className="flex w-full flex-col items-start px-3 py-2 text-left transition-colors hover:bg-stone-50"
                          onClick={() => selectMediaItem(item)}
                        >
                          <span className="text-sm font-medium text-stone-950">{item.title}</span>
                          <span className="mt-0.5 text-xs text-stone-500">
                            {formatMediaSearchMeta(item, mediaTypes)}
                            {item.existingReviewId ? " · уже есть рецензия" : ""}
                          </span>
                        </button>
                      </li>
                    ))}
                  </ul>
                )}
              </div>
            ) : null}
          </div>
        )}
        {!mediaItemLocked && !selectedMedia ? (
          <p className="text-xs text-stone-500">Выберите запись, прежде чем сохранять рецензию.</p>
        ) : null}
      </div>

      <div className="grid gap-2">
        <Label htmlFor="title">Заголовок</Label>
        <Input
          id="title"
          name="title"
          required
          maxLength={REVIEW_TITLE_MAX_LENGTH}
          defaultValue={state.values.title}
        />
      </div>

      <div className="grid gap-2">
        <Label htmlFor="body">Текст</Label>
        <Textarea
          id="body"
          name="body"
          required
          maxLength={REVIEW_BODY_MAX_LENGTH}
          defaultValue={state.values.body}
          className="h-[calc(100dvh-30rem)] min-h-64 resize-none overflow-y-auto"
        />
      </div>

      <div className="flex flex-wrap justify-end gap-2">
        {canSaveDraft ? (
          <Button
            type="submit"
            name="intent"
            value="draft"
            variant="outline"
            disabled={isPending || !selectedMedia}
          >
            Сохранить черновик
          </Button>
        ) : null}
        <Button
          type="submit"
          name="intent"
          value="submit"
          variant="positive"
          disabled={isPending || !selectedMedia}
        >
          {submitLabel}
        </Button>
      </div>

      {isConfirmOpen ? (
        <div className="fixed inset-0 z-50 grid place-items-center bg-stone-950/45 px-4 py-6">
          <button
            type="button"
            className="absolute inset-0 cursor-default"
            aria-label="Закрыть предупреждение"
            onClick={() => setIsConfirmOpen(false)}
          />
          <div
            role="dialog"
            aria-modal="true"
            aria-labelledby="review-submit-warning-title"
            className="relative grid w-full max-w-md gap-5 rounded-lg border border-stone-200 bg-white p-5 text-stone-950 shadow-xl"
          >
            <div>
              <h2 id="review-submit-warning-title" className="text-lg font-semibold tracking-tight">
                Отправить изменения?
              </h2>
              <p className="mt-2 text-sm leading-6 text-stone-600">
                Текущая опубликованная рецензия пропадет со страницы записи, пока администратор
                не одобрит новую версию.
              </p>
            </div>
            <div className="flex flex-wrap justify-end gap-2">
              <Button type="button" variant="outline" onClick={() => setIsConfirmOpen(false)}>
                Отмена
              </Button>
              <Button type="button" variant="positive" onClick={confirmPublishedReviewSubmit}>
                Отправить
              </Button>
            </div>
          </div>
        </div>
      ) : null}
    </form>
  )
}
