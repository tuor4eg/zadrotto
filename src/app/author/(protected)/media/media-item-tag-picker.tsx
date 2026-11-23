"use client";

import { useId, useState } from "react";
import { Search, X } from "lucide-react";

import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/form";
import { SearchInput } from "@/components/ui/search-input";
import { useTagSearch, type TagSearchOption } from "@/lib/tags/use-tag-search";

export function MediaItemTagPicker({ disabled }: { disabled: boolean }) {
  const id = useId();
  const [query, setQuery] = useState("");
  const [selected, setSelected] = useState<TagSearchOption[]>([]);
  const result = useTagSearch(query);
  const options = result?.items.filter((option) => !selected.some((tag) => tag.id === option.id)) ?? [];

  return (
    <div className="grid min-w-0 gap-2">
      <Label htmlFor={id}>Теги</Label>
      <div className="relative">
        <Search aria-hidden="true" className="pointer-events-none absolute left-3 top-1/2 z-10 size-4 -translate-y-1/2 text-stone-400" />
        <SearchInput id={id} className="pl-9" placeholder="Найти тег"
          value={query} maxLength={80} disabled={disabled}
          onChange={(event) => setQuery(event.currentTarget.value)}
          onKeyDown={(event) => {
            if (event.key === "Enter") event.preventDefault();
          }}
        />
      </div>
      {options.length ? (
        <ul aria-label="Найденные теги" className="flex flex-wrap gap-1.5">
          {options.map((option) => (
            <li key={option.id} className="min-w-0 max-w-full">
              <Button type="button" size="sm" variant="outline" disabled={disabled}
                className="h-auto min-h-7 whitespace-normal rounded-full px-2.5 lowercase"
                onClick={() => {
                  setSelected((current) => [...current, option]);
                  setQuery("");
                }}
              >
                {option.title}
              </Button>
            </li>
          ))}
        </ul>
      ) : null}
      {result?.error ? <p role="alert" className="text-xs text-red-700">{result.error}</p>
        : result && !options.length ? <p role="status" className="text-xs text-stone-500">Нет тегов для добавления.</p> : null}
      {selected.length ? (
        <ul aria-label="Выбранные теги" className="flex flex-wrap gap-1.5">
          {selected.map((tag) => (
            <li key={tag.id} className="inline-flex min-w-0 max-w-full items-center gap-1 rounded-full bg-stone-200/80 py-0.5 pl-2.5 pr-1 text-xs lowercase text-stone-800">
              <input type="hidden" name="tagIds" value={tag.id} />
              <span className="break-words">{tag.title}</span>
              <Button type="button" size="icon" variant="ghost" className="size-6 shrink-0 rounded-full"
                aria-label={`Убрать тег «${tag.title}»`} disabled={disabled}
                onClick={() => setSelected((current) => current.filter((option) => option.id !== tag.id))}
              >
                <X aria-hidden="true" className="size-3.5" />
              </Button>
            </li>
          ))}
        </ul>
      ) : null}
    </div>
  );
}
