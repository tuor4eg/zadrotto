"use client";

import { Check, Search } from "lucide-react";
import { useEffect, useId, useRef, useState, useTransition } from "react";

import { Input } from "@/components/ui/form";
import { cn } from "@/lib/common/utils";
import { searchManualBugReportAuthorsAction } from "../actions";

type AuthorOption = Awaited<ReturnType<typeof searchManualBugReportAuthorsAction>>[number];

export function ManualBugReportAuthorPicker({ id, name }: { id: string; name: string }) {
  const listboxId = useId();
  const requestIdRef = useRef(0);
  const rootRef = useRef<HTMLDivElement>(null);
  const [isPending, startTransition] = useTransition();
  const [open, setOpen] = useState(false);
  const [options, setOptions] = useState<AuthorOption[]>([]);
  const [query, setQuery] = useState("");
  const [resolvedQuery, setResolvedQuery] = useState("");
  const [searchFailed, setSearchFailed] = useState(false);
  const [selected, setSelected] = useState<AuthorOption | null>(null);

  useEffect(() => {
    if (!open || query.trim().length < 2 || selected) return;
    const requestId = ++requestIdRef.current;
    const timeoutId = window.setTimeout(() => {
      startTransition(async () => {
        try {
          const result = await searchManualBugReportAuthorsAction(query);
          if (requestId === requestIdRef.current) {
            setOptions(result);
            setResolvedQuery(query);
            setSearchFailed(false);
          }
        } catch {
          if (requestId === requestIdRef.current) {
            setOptions([]);
            setResolvedQuery(query);
            setSearchFailed(true);
          }
        }
      });
    }, 250);
    return () => window.clearTimeout(timeoutId);
  }, [open, query, selected]);

  useEffect(() => {
    if (!open) return;
    function handlePointerDown(event: PointerEvent) {
      if (!rootRef.current?.contains(event.target as Node)) setOpen(false);
    }
    function handleKeyDown(event: KeyboardEvent) {
      if (event.key === "Escape") setOpen(false);
    }
    document.addEventListener("pointerdown", handlePointerDown);
    document.addEventListener("keydown", handleKeyDown);
    return () => {
      document.removeEventListener("pointerdown", handlePointerDown);
      document.removeEventListener("keydown", handleKeyDown);
    };
  }, [open]);

  function selectAuthor(option: AuthorOption) {
    requestIdRef.current += 1;
    setSelected(option);
    setQuery(option.name);
    setResolvedQuery(option.name);
    setSearchFailed(false);
    setOptions([]);
    setOpen(false);
  }

  return (
    <div ref={rootRef} className="relative">
      <input type="hidden" name={name} value={selected?.id ?? ""} />
      <Search className="pointer-events-none absolute left-3 top-1/2 size-4 -translate-y-1/2 text-stone-400" />
      <Input
        id={id}
        type="search"
        role="combobox"
        aria-autocomplete="list"
        aria-controls={listboxId}
        aria-expanded={open}
        autoComplete="off"
        className="pl-9"
        placeholder="Имя, логин или почта"
        value={query}
        onFocus={() => setOpen(true)}
        onChange={(event) => {
          requestIdRef.current += 1;
          setSelected(null);
          setQuery(event.currentTarget.value);
          setResolvedQuery("");
          setSearchFailed(false);
          setOptions([]);
          setOpen(true);
        }}
        onKeyDown={(event) => {
          if (event.key === "Enter" && open) {
            event.preventDefault();
            if (options[0]) selectAuthor(options[0]);
          }
        }}
      />

      {open ? (
        <div
          id={listboxId}
          role="listbox"
          className="absolute left-0 right-0 top-full z-40 mt-1 max-h-72 overflow-y-auto rounded-md border border-stone-200 bg-white p-1 shadow-lg"
        >
          {query.trim().length < 2 ? (
            <div className="px-2.5 py-3 text-sm text-stone-500">Введи минимум два символа.</div>
          ) : isPending || resolvedQuery !== query ? (
            <div className="px-2.5 py-3 text-sm text-stone-500">Ищем пользователя…</div>
          ) : searchFailed ? (
            <div className="px-2.5 py-3 text-sm text-red-700">Не удалось выполнить поиск.</div>
          ) : options.length > 0 ? (
            options.map((option) => (
              <button
                key={option.id}
                type="button"
                role="option"
                aria-selected={selected?.id === option.id}
                className="flex w-full items-center gap-2 rounded-sm px-2.5 py-2 text-left text-sm text-stone-700 transition-colors hover:bg-stone-100"
                onMouseDown={(event) => {
                  event.preventDefault();
                  selectAuthor(option);
                }}
              >
                <span className="min-w-0 flex-1">
                  <span className="block truncate font-medium text-stone-950">{option.name}</span>
                  <span className="mt-0.5 block truncate text-xs text-stone-500">
                    {[option.login ? `@${option.login}` : null, option.email].filter(Boolean).join(" · ") || "Без аккаунта"}
                  </span>
                </span>
                <Check className={cn("size-4 shrink-0", selected?.id === option.id ? "opacity-100" : "opacity-0")} />
              </button>
            ))
          ) : (
            <div className="px-2.5 py-3 text-sm text-stone-500">Пользователи не найдены.</div>
          )}
        </div>
      ) : null}
    </div>
  );
}
