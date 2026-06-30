"use client";

import { Check, Search, X } from "lucide-react";
import { useEffect, useId, useMemo, useRef, useState } from "react";

import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/form";
import { cn } from "@/lib/common/utils";
import type { SearchableFranchiseOption } from "@/components/ui/searchable-franchise-select";

type SearchableFranchiseMultiSelectProps = {
  id: string;
  name: string;
  onChange: (value: string[]) => void;
  options: SearchableFranchiseOption[];
  value: string[];
};

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

export function SearchableFranchiseMultiSelect({
  id,
  name,
  onChange,
  options,
  value,
}: SearchableFranchiseMultiSelectProps) {
  const listboxId = useId();
  const rootRef = useRef<HTMLDivElement>(null);
  const [query, setQuery] = useState("");
  const [open, setOpen] = useState(false);
  const selectedIds = useMemo(() => new Set(value), [value]);
  const selectedOptions = options.filter((option) => selectedIds.has(String(option.id)));
  const visibleOptions = useMemo(
    () => options.filter((option) => matchesSearch(option, normalizeSearchValue(query))),
    [options, query],
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

  function toggleOption(option: SearchableFranchiseOption) {
    const optionId = String(option.id);

    onChange(
      selectedIds.has(optionId)
        ? value.filter((selectedId) => selectedId !== optionId)
        : [...value, optionId],
    );
    setQuery("");
    setOpen(true);
  }

  return (
    <div ref={rootRef} className="relative min-w-0 flex-1">
      {value.map((selectedId) => (
        <input key={selectedId} type="hidden" name={name} value={selectedId} />
      ))}

      <div className="relative">
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
            setOpen(true);
          }}
          onKeyDown={(event) => {
            if (event.key === "Enter" && open && visibleOptions[0]) {
              event.preventDefault();
              toggleOption(visibleOptions[0]);
            }
          }}
        />
      </div>

      {selectedOptions.length > 0 ? (
        <div className="mt-2 flex flex-wrap gap-1.5">
          {selectedOptions.map((option) => (
            <span
              key={option.id}
              className="inline-flex max-w-full items-center gap-1 rounded-md border border-stone-200 bg-stone-50 px-2 py-1 text-xs text-stone-700"
            >
              <span className="truncate">{option.title}</span>
              <button
                type="button"
                className="rounded-sm text-stone-400 transition-colors hover:text-stone-950 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-stone-900/20"
                aria-label={`Убрать серию ${option.title}`}
                onClick={() => toggleOption(option)}
              >
                <X className="size-3.5" />
              </button>
            </span>
          ))}
        </div>
      ) : null}

      {open ? (
        <div
          id={listboxId}
          role="listbox"
          className="absolute left-0 right-0 top-full z-40 mt-1 max-h-72 overflow-y-auto rounded-md border border-stone-200 bg-white p-1 shadow-lg"
        >
          {selectedOptions.length > 0 ? (
            <Button
              type="button"
              variant="ghost"
              className="mb-1 h-9 w-full justify-start px-2.5 text-sm text-stone-600"
              onMouseDown={(event) => {
                event.preventDefault();
                onChange([]);
                setQuery("");
              }}
            >
              Без серии
            </Button>
          ) : null}

          {visibleOptions.length > 0 ? (
            visibleOptions.map((option) => {
              const selected = selectedIds.has(String(option.id));

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
                    toggleOption(option);
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
