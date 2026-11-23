"use client"

import { X } from "lucide-react"
import { useEffect, useId, useRef, type ComponentProps } from "react"
import { createPortal } from "react-dom"

import { AdminMediaBrowser } from "@/components/admin/admin-media-browser"
import { Button } from "@/components/ui/button"
import { cn } from "@/lib/common/utils"
type MediaBrowserDialogProps = ComponentProps<typeof AdminMediaBrowser> & {
  onClose: () => void
  title?: string
}

export function MediaBrowserDialog({
  onClose,
  title = "Добавить записи",
  pageSize = 48,
  variant = "admin",
  ...browserProps
}: MediaBrowserDialogProps) {
  const titleId = useId()
  const archive = variant === "archive"
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
        aria-labelledby={titleId}
        tabIndex={-1}
        className={cn(
          "my-auto flex h-full max-h-[calc(100dvh-1.5rem)] w-full min-w-0 max-w-6xl flex-col shadow-2xl outline-none sm:max-h-[calc(100dvh-2.5rem)]",
          archive ? "archive-paper archive-paper-surface archive-panel" : "overflow-hidden rounded-lg border border-stone-200 bg-white",
        )}
      >
        <header className={cn(
          "flex shrink-0 items-start justify-between gap-4 px-4 py-3 sm:px-5",
          archive ? "pt-4 sm:pt-5" : "border-b border-stone-200",
        )}>
          <h2 id={titleId} className={archive
            ? "media-carrier-font-pc-steam text-2xl leading-none text-stone-950"
            : "text-lg font-semibold"}
          >
            {title}
          </h2>
          {archive ? (
            <button
              type="button"
              className="grid size-9 shrink-0 place-items-center rounded-md border border-stone-300/80 bg-stone-50/60 text-stone-700 transition-colors hover:border-stone-950 hover:text-stone-950"
              aria-label="Закрыть"
              onClick={onClose}
            >
              <X className="size-4" />
            </button>
          ) : (
            <Button type="button" variant="ghost" size="icon" aria-label="Закрыть" onClick={onClose}>
              <X />
            </Button>
          )}
        </header>
        <div className={cn(
          "min-h-0 flex-1 overflow-y-auto overscroll-contain",
          archive ? "archive-scrollbar px-4 pb-[max(1rem,env(safe-area-inset-bottom))] sm:px-5 sm:pb-5" : "p-3 sm:p-5",
        )}>
          <AdminMediaBrowser
            className={archive ? "border-0 bg-transparent p-0" : undefined}
            variant={variant}
            pageSize={pageSize}
            {...browserProps}
          />
        </div>
      </div>
    </div>,
    document.body,
  )
}
