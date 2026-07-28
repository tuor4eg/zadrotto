"use client";

import { useCallback, useEffect, useId, useLayoutEffect, useRef, useState } from "react";
import { Check, ChevronDown } from "lucide-react";

import { cn } from "@/lib/common/utils";

type ArchiveSelectOption<TValue extends string> = {
  icon?: React.ReactNode;
  label: string;
  value: TValue;
};

type ArchiveSelectProps<TValue extends string> = {
  ariaLabel: string;
  className?: string;
  compact?: boolean;
  onOpenChange?: (isOpen: boolean) => void;
  onIconClick?: (value: TValue) => void;
  onChange: (value: TValue) => void;
  options: ArchiveSelectOption<TValue>[];
  triggerClassName?: string;
  value: TValue;
};

export function ArchiveSelect<TValue extends string>({
  ariaLabel,
  className,
  compact = false,
  onOpenChange,
  onIconClick,
  onChange,
  options,
  triggerClassName,
  value,
}: ArchiveSelectProps<TValue>) {
  const [isOpen, setIsOpen] = useState(false);
  const [menuLayout, setMenuLayout] = useState({
    maxHeight: 288,
    placement: "bottom" as "bottom" | "top",
  });
  const selectId = useId();
  const rootRef = useRef<HTMLDivElement>(null);
  const selectedOption = options.find((option) => option.value === value) ?? options[0];

  const updateOpen = useCallback((nextOpen: boolean) => {
    setIsOpen(nextOpen);
    onOpenChange?.(nextOpen);
  }, [onOpenChange]);

  useEffect(() => {
    if (!isOpen) {
      return;
    }

    function handlePointerDown(event: PointerEvent) {
      if (!rootRef.current?.contains(event.target as Node)) {
        updateOpen(false);
      }
    }

    function handleKeyDown(event: KeyboardEvent) {
      if (event.key === "Escape") {
        updateOpen(false);
      }
    }

    document.addEventListener("pointerdown", handlePointerDown);
    document.addEventListener("keydown", handleKeyDown);

    return () => {
      document.removeEventListener("pointerdown", handlePointerDown);
      document.removeEventListener("keydown", handleKeyDown);
    };
  }, [isOpen, updateOpen]);

  useLayoutEffect(() => {
    if (!isOpen || !rootRef.current) {
      return;
    }

    function updateMenuLayout() {
      const triggerRect = rootRef.current?.getBoundingClientRect();

      if (!triggerRect) {
        return;
      }

      const viewportTop = window.visualViewport?.offsetTop ?? 0;
      const viewportHeight = window.visualViewport?.height ?? window.innerHeight;
      const viewportBottom = viewportTop + viewportHeight;
      const availableAbove = triggerRect.top - viewportTop - 16;
      const availableBelow = viewportBottom - triggerRect.bottom - 16;
      const placement = availableBelow >= Math.min(288, availableAbove) ? "bottom" : "top";
      const availableHeight = placement === "bottom" ? availableBelow : availableAbove;

      setMenuLayout({
        maxHeight: Math.max(0, Math.min(288, availableHeight)),
        placement,
      });
    }

    updateMenuLayout();
    window.addEventListener("resize", updateMenuLayout);
    window.visualViewport?.addEventListener("resize", updateMenuLayout);
    window.visualViewport?.addEventListener("scroll", updateMenuLayout);

    return () => {
      window.removeEventListener("resize", updateMenuLayout);
      window.visualViewport?.removeEventListener("resize", updateMenuLayout);
      window.visualViewport?.removeEventListener("scroll", updateMenuLayout);
    };
  }, [isOpen]);

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

      {isOpen ? (
        <div
          id={selectId}
          role="listbox"
          aria-label={ariaLabel}
          className={cn(
            "archive-paper-surface archive-scrollbar absolute right-0 z-[80] w-[min(16rem,calc(100vw-2rem))] min-w-full overflow-y-auto rounded-md border border-stone-500/70 p-1 shadow-[0_14px_26px_rgba(28,25,23,0.24)]",
            menuLayout.placement === "bottom" ? "top-full mt-2" : "bottom-full mb-2",
          )}
          style={{ maxHeight: menuLayout.maxHeight }}
        >
          {options.map((option) => {
            const selected = option.value === value;

            return (
              <button
                key={option.value}
                type="button"
                role="option"
                aria-selected={selected}
                onClick={() => {
                  onChange(option.value);
                  updateOpen(false);
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
                      event.stopPropagation();
                      onIconClick(option.value);
                      updateOpen(false);
                    }}
                    onKeyDown={(event) => {
                      if (event.key === "Enter" || event.key === " ") {
                        event.preventDefault();
                        event.stopPropagation();
                        onIconClick(option.value);
                        updateOpen(false);
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
            );
          })}
        </div>
      ) : null}
    </div>
  );
}
