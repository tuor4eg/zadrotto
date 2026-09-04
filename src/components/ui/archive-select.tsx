"use client"

import { useCallback, useEffect, useId, useLayoutEffect, useRef, useState } from "react"
import { createPortal } from "react-dom"
import { Check, ChevronDown } from "lucide-react"

import { cn } from "@/lib/common/utils"

type ArchiveSelectOption<TValue extends string> = {
  icon?: React.ReactNode
  label: string
  value: TValue
}

type ArchiveSelectProps<TValue extends string> = {
  ariaLabel: string
  className?: string
  compact?: boolean
  menuClassName?: string
  onOpenChange?: (isOpen: boolean) => void
  onIconClick?: (value: TValue) => void
  onChange: (value: TValue) => void
  options: ArchiveSelectOption<TValue>[]
  triggerClassName?: string
  value: TValue
}

type MenuLayout = {
  left: number
  maxHeight: number
  placement: "bottom" | "top"
  top: number
  width: number
}

export function ArchiveSelect<TValue extends string>({
  ariaLabel,
  className,
  compact = false,
  menuClassName,
  onOpenChange,
  onIconClick,
  onChange,
  options,
  triggerClassName,
  value,
}: ArchiveSelectProps<TValue>) {
  const [isOpen, setIsOpen] = useState(false)
  const [menuLayout, setMenuLayout] = useState<MenuLayout | null>(null)
  const selectId = useId()
  const menuRef = useRef<HTMLDivElement>(null)
  const rootRef = useRef<HTMLDivElement>(null)
  const selectedOption = options.find((option) => option.value === value) ?? options[0]

  const seedMenuLayout = useCallback(() => {
    const triggerRect = rootRef.current?.getBoundingClientRect()

    if (!triggerRect) {
      return
    }

    const viewportTop = window.visualViewport?.offsetTop ?? 0
    const viewportHeight = window.visualViewport?.height ?? window.innerHeight
    const viewportBottom = viewportTop + viewportHeight
    const desiredMenuHeight = options.length * 36 + 18
    const availableAbove = triggerRect.top - viewportTop - 16
    const availableBelow = viewportBottom - triggerRect.bottom - 16
    const placement =
      availableBelow >= Math.min(desiredMenuHeight, availableAbove) ? "bottom" : "top"
    const availableHeight = placement === "bottom" ? availableBelow : availableAbove
    const maxHeight = Math.max(0, Math.min(desiredMenuHeight, availableHeight))
    const width = Math.max(triggerRect.width, Math.min(16 * 16, window.innerWidth - 32))
    const left = Math.min(
      Math.max(16, triggerRect.right - width),
      window.innerWidth - width - 16,
    )

    setMenuLayout({
      left,
      maxHeight,
      placement,
      top:
        placement === "bottom"
          ? triggerRect.bottom + 8
          : triggerRect.top - 8 - maxHeight,
      width,
    })
  }, [options.length])

  const updateOpen = useCallback((nextOpen: boolean) => {
    if (nextOpen) {
      seedMenuLayout()
    } else {
      setMenuLayout(null)
    }
    setIsOpen(nextOpen)
    onOpenChange?.(nextOpen)
  }, [onOpenChange, seedMenuLayout])

  useEffect(() => {
    if (!isOpen) {
      return
    }

    function handlePointerDown(event: PointerEvent) {
      const target = event.target as Node
      if (rootRef.current?.contains(target) || menuRef.current?.contains(target)) {
        return
      }
      updateOpen(false)
    }

    function handleKeyDown(event: KeyboardEvent) {
      if (event.key === "Escape") {
        updateOpen(false)
      }
    }

    document.addEventListener("pointerdown", handlePointerDown)
    document.addEventListener("keydown", handleKeyDown)

    return () => {
      document.removeEventListener("pointerdown", handlePointerDown)
      document.removeEventListener("keydown", handleKeyDown)
    }
  }, [isOpen, updateOpen])

  useLayoutEffect(() => {
    if (!isOpen || !rootRef.current) {
      return
    }

    function updateMenuLayout() {
      const triggerRect = rootRef.current?.getBoundingClientRect()

      if (!triggerRect) {
        return
      }

      const viewportTop = window.visualViewport?.offsetTop ?? 0
      const viewportHeight = window.visualViewport?.height ?? window.innerHeight
      const viewportBottom = viewportTop + viewportHeight
      const desiredMenuHeight = menuRef.current
        ? menuRef.current.scrollHeight + menuRef.current.clientTop * 2
        : options.length * 36 + 18
      const availableAbove = triggerRect.top - viewportTop - 16
      const availableBelow = viewportBottom - triggerRect.bottom - 16
      const placement =
        availableBelow >= Math.min(desiredMenuHeight, availableAbove) ? "bottom" : "top"
      const availableHeight = placement === "bottom" ? availableBelow : availableAbove
      const maxHeight = Math.max(0, Math.min(desiredMenuHeight, availableHeight))
      const width = Math.max(triggerRect.width, Math.min(16 * 16, window.innerWidth - 32))
      const left = Math.min(
        Math.max(16, triggerRect.right - width),
        window.innerWidth - width - 16,
      )

      setMenuLayout({
        left,
        maxHeight,
        placement,
        top:
          placement === "bottom"
            ? triggerRect.bottom + 8
            : triggerRect.top - 8 - maxHeight,
        width,
      })
    }

    updateMenuLayout()
    const rafId = window.requestAnimationFrame(updateMenuLayout)
    window.addEventListener("resize", updateMenuLayout)
    window.addEventListener("scroll", updateMenuLayout, true)
    window.visualViewport?.addEventListener("resize", updateMenuLayout)
    window.visualViewport?.addEventListener("scroll", updateMenuLayout)

    return () => {
      window.cancelAnimationFrame(rafId)
      window.removeEventListener("resize", updateMenuLayout)
      window.removeEventListener("scroll", updateMenuLayout, true)
      window.visualViewport?.removeEventListener("resize", updateMenuLayout)
      window.visualViewport?.removeEventListener("scroll", updateMenuLayout)
    }
  }, [isOpen, options.length])

  const menu =
    isOpen && menuLayout && typeof document !== "undefined"
      ? createPortal(
          <div
            ref={menuRef}
            id={selectId}
            role="listbox"
            aria-label={ariaLabel}
            className={cn(
              "archive-paper-surface archive-scrollbar fixed z-[120] overflow-y-auto rounded-md border border-stone-500/70 p-1 shadow-[0_14px_26px_rgba(28,25,23,0.24)]",
              menuClassName,
            )}
            style={{
              left: menuLayout.left,
              maxHeight: menuLayout.maxHeight,
              top: menuLayout.top,
              width: menuLayout.width,
            }}
          >
            {options.map((option) => {
              const selected = option.value === value

              return (
                <button
                  key={option.value}
                  type="button"
                  role="option"
                  aria-selected={selected}
                  onClick={() => {
                    onChange(option.value)
                    updateOpen(false)
                  }}
                  className={cn(
                    "flex h-9 w-full items-center gap-2 rounded-sm px-2.5 text-left font-mono text-xs uppercase tracking-[0.1em] transition-colors",
                    selected
                      ? "bg-red-900/10 text-stone-950"
                      : "text-stone-700 hover:bg-stone-200/60 hover:text-stone-950",
                  )}
                >
                  {onIconClick ? (
                    <span
                      role="button"
                      tabIndex={0}
                      onClick={(event) => {
                        event.stopPropagation()
                        onIconClick(option.value)
                        updateOpen(false)
                      }}
                      onKeyDown={(event) => {
                        if (event.key === "Enter" || event.key === " ") {
                          event.preventDefault()
                          event.stopPropagation()
                          onIconClick(option.value)
                          updateOpen(false)
                        }
                      }}
                      className="grid size-6 shrink-0 place-items-center rounded-sm text-stone-600 hover:bg-stone-300/60 hover:text-stone-950"
                    >
                      {option.icon}
                    </span>
                  ) : (
                    <span className="grid size-4 shrink-0 place-items-center text-stone-600">
                      {option.icon}
                    </span>
                  )}
                  <span className="min-w-0 flex-1 truncate">{option.label}</span>
                  <Check
                    className={cn(
                      "size-3.5 shrink-0 text-red-900",
                      selected ? "opacity-100" : "opacity-0",
                    )}
                  />
                </button>
              )
            })}
          </div>,
          document.body,
        )
      : null

  return (
    <div ref={rootRef} className={cn("relative", className)}>
      <button
        type="button"
        aria-label={ariaLabel}
        aria-haspopup="listbox"
        aria-expanded={isOpen}
        aria-controls={selectId}
        onClick={() => updateOpen(!isOpen)}
        className={cn(
          "archive-control-surface inline-flex h-9 items-center justify-center rounded-md border border-stone-300/80 font-mono text-xs uppercase tracking-[0.12em] text-stone-700 shadow-[inset_0_1px_1px_rgba(68,64,60,0.08)] transition-colors hover:border-stone-700 hover:bg-stone-50 focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-stone-950",
          compact ? "w-9 px-0" : "min-w-[190px] gap-2 px-3",
          triggerClassName,
        )}
      >
        <span className="grid size-4 shrink-0 place-items-center text-stone-600">
          {selectedOption.icon}
        </span>
        <span className={compact ? "sr-only" : "truncate"}>{selectedOption.label}</span>
        {compact ? null : <ChevronDown className="ml-auto size-3.5 shrink-0 text-stone-500" />}
      </button>
      {menu}
    </div>
  )
}
