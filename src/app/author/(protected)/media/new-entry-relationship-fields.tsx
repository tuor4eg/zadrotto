"use client";

import { Search } from "lucide-react";
import { useEffect, useState } from "react";

import { ToggleSwitch } from "@/components/ui/route-switch";
import { SearchInput } from "@/components/ui/search-input";
import type { NewEntryRelationship } from "@/lib/media/entry-sources";
import { normalizeSearchText } from "@/lib/search/normalize";

type RelationshipOption = {
  id: number;
  title: string;
  originalTitle: string | null;
  mediaTypeName: string;
  releaseYear: number | null;
};

export function NewEntryRelationshipFields() {
  const [enabled, setEnabled] = useState(false);
  const [direction, setDirection] = useState<NewEntryRelationship["direction"]>("source");
  const [text, setText] = useState("");
  const [selected, setSelected] = useState<RelationshipOption | null>(null);
  const [result, setResult] = useState<{ query: string; items: RelationshipOption[]; failed?: boolean }>();
  const query = normalizeSearchText(text);
  const searching = enabled && !selected && query.length >= 2;
  const current = searching && result?.query === query ? result : undefined;

  useEffect(() => {
    if (!searching) return;
    const controller = new AbortController();
    const timer = setTimeout(async () => {
      try {
        const params = new URLSearchParams({ q: query });
        const response = await fetch(`/api/media/relationship-search?${params}`, { signal: controller.signal });
        if (!response.ok) throw new Error("Search failed");
        const { items } = await response.json() as { items: RelationshipOption[] };
        if (!controller.signal.aborted) setResult({ query, items });
      } catch {
        if (!controller.signal.aborted) setResult({ query, items: [], failed: true });
      }
    }, 250);
    return () => {
      clearTimeout(timer);
      controller.abort();
    };
  }, [query, searching]);

  return (
    <div className="grid gap-4 sm:col-span-2 lg:col-span-3">
      <div><ToggleSwitch checked={enabled} label="Установить связь" onCheckedChange={setEnabled} /></div>
      {enabled && (
        <>
          <fieldset>
            <legend className="sr-only">Направление связи</legend>
            <div className="flex flex-wrap gap-x-5 gap-y-2">
              {([["source", "Основано на"], ["adaptation", "Основа для"]] as const).map(([value, label]) => (
                <label key={value} className="inline-flex items-center gap-2 text-sm">
                  <input
                    type="radio"
                    className="size-4 accent-stone-900"
                    name="entryRelationshipDirection"
                    value={value}
                    checked={direction === value}
                    onChange={() => setDirection(value)}
                  />
                  {label}
                </label>
              ))}
            </div>
          </fieldset>
          <div className="relative">
            <Search aria-hidden className="pointer-events-none absolute left-3 top-1/2 z-10 size-4 -translate-y-1/2 text-stone-400" />
            <SearchInput
              aria-label="Найти связанную запись"
              placeholder="Найти запись по названию"
              className="pl-9"
              maxLength={200}
              value={selected?.title ?? text}
              onChange={(event) => {
                setSelected(null);
                setText(event.currentTarget.value);
              }}
              onKeyDown={(event) => {
                if (event.key === "Enter") event.preventDefault();
              }}
            />
          </div>
          {selected && <input type="hidden" name="entryRelationshipTarget" value={selected.id} />}
          {searching && (
            current?.items.length ? (
              <ul className="max-h-56 overflow-y-auto rounded-md border border-stone-200 bg-white p-1">
                {current.items.map((item) => (
                  <li key={item.id}>
                    <button type="button" className="block w-full rounded-sm px-2.5 py-2 text-left text-sm text-stone-700 hover:bg-stone-100 focus-visible:bg-stone-100" onClick={() => setSelected(item)}>
                      <span className="block font-medium">{item.title}</span>
                      <span className="block text-xs text-stone-500">
                        {[item.originalTitle !== item.title ? item.originalTitle : null, item.mediaTypeName, item.releaseYear].filter(Boolean).join(" · ")}
                      </span>
                    </button>
                  </li>
                ))}
              </ul>
            ) : (
              <p className="text-xs text-stone-500" role={current?.failed ? "alert" : "status"}>
                {!current ? "Поиск…" : current.failed ? "Не удалось найти записи." : "Ничего не найдено."}
              </p>
            )
          )}
        </>
      )}
    </div>
  );
}
