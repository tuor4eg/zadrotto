"use client"

import { X } from "lucide-react"
import { useEffect, useRef } from "react"
import { createPortal } from "react-dom"

import { AdminMediaBrowser } from "@/components/admin/admin-media-browser"
import type { AdminMediaBrowserItem, AdminMediaBrowserSeriesOption } from "@/lib/admin/media-browser"
import type { MediaTypeOption } from "@/lib/media/types"

type TierListMediaBrowserDialogProps = {
  excludedIds: readonly number[]
  maxSelection: number
  mediaTypes: readonly MediaTypeOption[]
  onClose: () => void
  onConfirm: (items: AdminMediaBrowserItem[]) => void
  series: readonly AdminMediaBrowserSeriesOption[]
}

export function TierListMediaBrowserDialog({
  excludedIds,
  maxSelection,
  mediaTypes,
  onClose,
  onConfirm,
  series,
}: TierListMediaBrowserDialogProps) {
  const dialogRef = useRef<HTMLDivElement>(null)
  const onCloseRef = useRef(onClose)

  useEffect(() => {
    onCloseRef.current = onClose
  }, [onClose])

  useEffect(() => {
    const previouslyFocused = document.activeElement instanceof HTMLElement
      ? document.activeElement
      : null
    const previousOverflow = document.body.style.overflow
    document.body.style.overflow = "hidden"
    dialogRef.current?.focus()

    function onKeyDown(event: KeyboardEvent) {
      if (event.key === "Escape" && !event.defaultPrevented) onCloseRef.current()
    }

    window.addEventListener("keydown", onKeyDown)
    return () => {
      document.body.style.overflow = previousOverflow
      window.removeEventListener("keydown", onKeyDown)
      previouslyFocused?.focus()
    }
  }, [])

  return createPortal(
    <div
      className="fixed inset-0 z-[100] flex min-h-0 justify-center overflow-hidden bg-stone-950/45 px-3 py-3 sm:items-center sm:px-5 sm:py-5"
      role="presentation"
      onMouseDown={(event) => {
        if (event.target === event.currentTarget) onClose()
      }}
    >
      <div
        ref={dialogRef}
        role="dialog"
        aria-modal="true"
        aria-labelledby="tier-media-browser-title"
        tabIndex={-1}
        className="archive-paper archive-paper-surface archive-panel my-auto flex h-full max-h-[calc(100dvh-1.5rem)] w-full min-w-0 max-w-6xl flex-col shadow-2xl outline-none sm:max-h-[calc(100dvh-2.5rem)]"
      >
        <div className="shrink-0 p-4 pb-3 sm:p-5 sm:pb-3">
          <div className="flex items-start justify-between gap-4">
            <div
              id="tier-media-browser-title"
              className="media-carrier-font-pc-steam text-2xl leading-none text-stone-950"
            >
              Добавить записи
            </div>
            <button
              type="button"
              className="grid size-9 shrink-0 place-items-center rounded-md border border-stone-300/80 bg-stone-50/60 text-stone-700 transition-colors hover:border-stone-950 hover:text-stone-950"
              aria-label="Закрыть"
              onClick={onClose}
            >
              <X className="size-4" />
            </button>
          </div>
        </div>
        <div className="archive-scrollbar min-h-0 flex-1 overflow-y-auto overscroll-contain px-4 pb-[max(1rem,env(safe-area-inset-bottom))] sm:px-5 sm:pb-5">
          <AdminMediaBrowser
            className="border-0 bg-transparent p-0"
            endpoint="/api/tier-lists/media-browser"
            excludedIds={excludedIds}
            maxSelection={maxSelection}
            mediaTypes={mediaTypes}
            pageSize={48}
            series={series}
            variant="archive"
            onConfirm={onConfirm}
          />
        </div>
      </div>
    </div>,
    document.body,
  )
}
