"use client";

import { useEffect, useId, useState } from "react";

import { SearchInput } from "@/components/ui/search-input";

type CreatorOption = { id: number; name: string; slug: string; originalName?: string | null };

export function MediaBrowserCreatorSelect({ endpoint, id, value, onChange, variant }: {
  endpoint: string;
  id: string;
  value: string;
  onChange: (value: string) => void;
  variant: "admin" | "archive";
}) {
  const listId = useId();
  const [text, setText] = useState("");
  const [selected, setSelected] = useState<CreatorOption | null>(null);
  const [open, setOpen] = useState(false);
  const [active, setActive] = useState(0);
  const [result, setResult] = useState<{ query: string; items: CreatorOption[]; error?: boolean }>();
  const query = text.trim();
  const canSearch = open && query.length >= 2;
  const currentResult = canSearch && result?.query === query ? result : undefined;
  const items = currentResult?.items ?? [];
  const displayedText = selected ? (String(selected.id) === value ? selected.name : "") : text;

  useEffect(() => {
    if (!canSearch) return;
    const controller = new AbortController();
    const timer = setTimeout(async () => {
      const [path, search] = endpoint.split("?", 2);
      const params = new URLSearchParams(search);
      params.set("suggest", "creators");
      params.set("q", query);
      try {
        const response = await fetch(`${path}?${params.toString()}`, { signal: controller.signal });
        if (!response.ok) throw new Error("Creator search failed");
        const items: CreatorOption[] = await response.json();
        if (!controller.signal.aborted) setResult({ query, items });
      } catch {
        if (!controller.signal.aborted) setResult({ query, items: [], error: true });
      }
    }, 250);
    return () => {
      clearTimeout(timer);
      controller.abort();
    };
  }, [canSearch, endpoint, query]);

  function select(option: CreatorOption | null) {
    setSelected(option);
    setText("");
    setActive(0);
    onChange(option ? String(option.id) : "");
    setOpen(false);
  }

  return (
    <div className="relative z-20" onBlur={(event) => {
      if (!event.currentTarget.contains(event.relatedTarget)) setOpen(false);
    }}>
      <SearchInput
        id={id}
        role="combobox"
        aria-autocomplete="list"
        aria-expanded={open}
        aria-controls={open ? listId : undefined}
        aria-activedescendant={items[active] ? `${listId}-${active}` : undefined}
        autoComplete="off"
        className={variant === "archive" ? "h-10 border-stone-300/80 bg-stone-50/70 font-mono text-sm" : undefined}
        placeholder="Имя или псевдоним"
        maxLength={200}
        value={displayedText}
        onFocus={() => setOpen(true)}
        onClick={() => setOpen(true)}
        onChange={(event) => {
          setSelected(null);
          setText(event.currentTarget.value);
          setActive(0);
          if (value) onChange("");
          setOpen(true);
        }}
        onKeyDown={(event) => {
          if (event.key === "Escape" && open) {
            event.preventDefault();
            event.stopPropagation();
            setOpen(false);
          }
          if (event.key === "Enter" && open && items[active]) {
            event.preventDefault();
            select(items[active]);
          }
          if (event.key === "ArrowDown" || event.key === "ArrowUp") {
            event.preventDefault();
            setOpen(true);
            if (!items.length) return;
            const next = (active + (event.key === "ArrowDown" ? 1 : -1) + items.length) % items.length;
            setActive(next);
            document.getElementById(`${listId}-${next}`)?.scrollIntoView({ block: "nearest" });
          }
        }}
      />
      {open ? (
        <div id={listId} role="listbox" aria-label="Создатели" className="absolute z-50 mt-1 max-h-72 w-full overflow-auto rounded-md border border-stone-200 bg-white p-1 shadow-lg">
          {value ? <button type="button" role="option" aria-selected={false} className="w-full p-2 text-left text-sm hover:bg-stone-100" onClick={() => select(null)}>Все создатели</button> : null}
          {items.map((option, index) => {
            const duplicate = items.some((other) => other.id !== option.id && other.name === option.name);
            const subtitle = duplicate ? option.slug : option.originalName;
            return (
              <button key={option.id} id={`${listId}-${index}`} type="button" role="option"
                aria-selected={index === active}
                tabIndex={-1}
                className="block w-full rounded-sm p-2 text-left text-sm hover:bg-stone-100 aria-selected:bg-stone-100"
                onMouseDown={(event) => event.preventDefault()}
                onClick={() => select(option)}
              >
                {option.name}
                {subtitle && subtitle !== option.name ? (
                  <span className="block text-xs text-stone-500">{subtitle}</span>
                ) : null}
              </button>
            );
          })}
          {!items.length && !value ? (
            <p role={currentResult?.error ? "alert" : "status"} className="p-2 text-sm text-stone-500">
              {!canSearch ? "Введите хотя бы два символа."
                : !currentResult ? "Ищем создателей…"
                  : currentResult.error ? "Не удалось найти создателей." : "Создатели не найдены."}
            </p>
          ) : null}
        </div>
      ) : null}
    </div>
  );
}
