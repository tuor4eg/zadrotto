"use client";

import { Check, Search } from "lucide-react";
import { useEffect, useId, useMemo, useRef, useState } from "react";

import { Input } from "@/components/ui/form";
import { cn } from "@/lib/common/utils";

export type SearchableFranchiseOption = {
  id: number;
  title: string;
  originalTitle: string | null;
};

type SearchableFranchiseSelectProps = {
  id: string;
  name: string;
  onChange: (value: string) => void;
  options: SearchableFranchiseOption[];
  value: string;
};

function formatFranchiseOption(option: SearchableFranchiseOption) {
  return option.title;
}

function normalizeSearchValue(value: string) {
  return value.trim().toLowerCase();
}

function matchesSearch(option: SearchableFranchiseOption, searchValue: string) {
  if (!searchValue) {
    return true;
  }

  return [option.title, option.originalTitle]
    .filter(Boolean)
    .join(" ")
    .toLowerCase()
    .includes(searchValue);
}

export function SearchableFranchiseSelect({
  id,
  name,
  onChange,
  options,
  value,
}: SearchableFranchiseSelectProps) {
  const listboxId = useId();
  const rootRef = useRef<HTMLDivElement>(null);
  const selectedOption = options.find((option) => String(option.id) === value) ?? null;
  const [query, setQuery] = useState(selectedOption ? formatFranchiseOption(selectedOption) : "");
  const [open, setOpen] = useState(false);
  const normalizedQuery = normalizeSearchValue(query);
  const visibleOptions = useMemo(
    () => options.filter((option) => matchesSearch(option, normalizedQuery)),
    [normalizedQuery, options],
  );

  useEffect(() => {
    if (!open) {
      return;
    }

    function handlePointerDown(event: PointerEvent) {
      if (!rootRef.current?.contains(event.target as Node)) {
        setOpen(false);
      }
    }

    function handleKeyDown(event: KeyboardEvent) {
      if (event.key === "Escape") {
        setOpen(false);
      }
    }

    document.addEventListener("pointerdown", handlePointerDown);
    document.addEventListener("keydown", handleKeyDown);

    return () => {
      document.removeEventListener("pointerdown", handlePointerDown);
      document.removeEventListener("keydown", handleKeyDown);
    };
  }, [open]);

  function selectOption(option: SearchableFranchiseOption) {
    onChange(String(option.id));
    setQuery(formatFranchiseOption(option));
    setOpen(false);
  }

  function clearSelection() {
    onChange("");
    setQuery("");
    setOpen(false);
  }

  return (
    <div ref={rootRef} className="relative min-w-0 flex-1">
      <input type="hidden" name={name} value={value} />
      <Search className="pointer-events-none absolute left-3 top-1/2 size-4 -translate-y-1/2 text-stone-400" />
      <Input
        id={id}
        type="search"
        role="combobox"
        aria-autocomplete="list"
        aria-controls={listboxId}
        aria-expanded={open}
        autoComplete="off"
        placeholder="Найти серию"
        value={query}
        className="pl-9"
        onFocus={() => setOpen(true)}
        onChange={(event) => {
          setQuery(event.currentTarget.value);
          onChange("");
          setOpen(true);
        }}
        onKeyDown={(event) => {
          if (event.key === "Enter" && open && visibleOptions[0]) {
            event.preventDefault();
            selectOption(visibleOptions[0]);
          }
        }}
      />
      {open ? (
        <div
          id={listboxId}
          role="listbox"
          className="absolute left-0 right-0 top-full z-40 mt-1 max-h-72 overflow-y-auto rounded-md border border-stone-200 bg-white p-1 shadow-lg"
        >
          <button
            type="button"
            role="option"
            aria-selected={value === ""}
            className={cn(
              "flex h-9 w-full items-center gap-2 rounded-sm px-2.5 text-left text-sm transition-colors hover:bg-stone-100",
              value === "" ? "text-stone-950" : "text-stone-600",
            )}
            onMouseDown={(event) => {
              event.preventDefault();
              clearSelection();
            }}
          >
            <span className="min-w-0 flex-1 truncate">Без серии</span>
            <Check className={cn("size-4 shrink-0", value === "" ? "opacity-100" : "opacity-0")} />
          </button>

          {visibleOptions.length > 0 ? (
            visibleOptions.map((option) => {
              const selected = String(option.id) === value;

              return (
                <button
                  key={option.id}
                  type="button"
                  role="option"
                  aria-selected={selected}
                  className={cn(
                    "flex w-full items-center gap-2 rounded-sm px-2.5 py-2 text-left text-sm transition-colors hover:bg-stone-100",
                    selected ? "text-stone-950" : "text-stone-700",
                  )}
                  onMouseDown={(event) => {
                    event.preventDefault();
                    selectOption(option);
                  }}
                >
                  <span className="min-w-0 flex-1">
                    <span className="block truncate font-medium">{option.title}</span>
                    {option.originalTitle ? (
                      <span className="mt-0.5 block truncate text-xs text-stone-500">
                        {option.originalTitle}
                      </span>
                    ) : null}
                  </span>
                  <Check
                    className={cn("size-4 shrink-0", selected ? "opacity-100" : "opacity-0")}
                  />
                </button>
              );
            })
          ) : (
            <div className="px-2.5 py-3 text-sm text-stone-500">Серий по этому поиску нет.</div>
          )}
        </div>
      ) : null}
    </div>
  );
}
