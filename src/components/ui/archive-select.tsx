"use client";

import { useCallback, useEffect, useId, useRef, useState } from "react";
import { Check, ChevronDown } from "lucide-react";

import { cn } from "@/lib/utils";

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
  value,
}: ArchiveSelectProps<TValue>) {
  const [isOpen, setIsOpen] = useState(false);
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
          "inline-flex h-9 items-center justify-center rounded-md border border-stone-300/80 bg-stone-50/80 font-mono text-xs uppercase tracking-[0.12em] text-stone-700 shadow-[inset_0_1px_1px_rgba(68,64,60,0.08)] transition-colors hover:border-stone-700 hover:bg-stone-50 focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-stone-950",
          compact ? "w-9 px-0" : "min-w-[190px] gap-2 px-3",
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
          className="archive-paper-surface archive-scrollbar absolute right-0 top-full z-[80] mt-2 max-h-[min(18rem,calc(100vh-8rem))] w-max min-w-[230px] overflow-y-auto rounded-md border border-stone-500/70 p-1 shadow-[0_14px_26px_rgba(28,25,23,0.24)]"
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
                <span className="whitespace-nowrap">{option.label}</span>
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
