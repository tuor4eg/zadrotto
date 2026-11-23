"use client";

import { Plus, Search } from "lucide-react";
import { useActionState, useEffect, useId, useState } from "react";

import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/form";
import { SearchInput } from "@/components/ui/search-input";
import type { EntrySourceSearchOption } from "@/lib/media/entry-sources";
import { normalizeSearchText } from "@/lib/search/normalize";

import { attachTagToEntryAction } from "../../actions";

export function AttachTagPicker({ tagId, taggedEntryCount }: { tagId: number; taggedEntryCount: number }) {
  const id = useId();
  const [text, setText] = useState("");
  const query = normalizeSearchText(text);
  const [result, setResult] = useState<{ query: string; items: EntrySourceSearchOption[]; error?: boolean }>();
  const current = result?.query === query ? result : undefined;
  const [state, action, pending] = useActionState(async (
    _previous: { query: string; error: string | null },
    form: FormData,
  ) => {
    const response = await attachTagToEntryAction(tagId, form);
    if (!response.error) {
      const attachedId = Number(form.get("mediaItemId"));
      setResult((previous) => previous && {
        ...previous,
        items: previous.items.filter((item) => item.id !== attachedId),
      });
    }
    return { query, error: response.error };
  }, { query: "", error: null });

  useEffect(() => {
    if (query.length < 2) return;
    const controller = new AbortController();
    const timer = setTimeout(async () => {
      try {
        const params = new URLSearchParams({ type: "entry", q: query, excludeTag: String(tagId) });
        const response = await fetch(`/api/admin/entry-sources/search?${params}`, { signal: controller.signal, cache: "no-store" });
        if (!response.ok) throw new Error("Search failed");
        const { items } = await response.json() as { items: EntrySourceSearchOption[] };
        if (!controller.signal.aborted) setResult({ query, items });
      } catch {
        if (!controller.signal.aborted) setResult({ query, items: [], error: true });
      }
    }, 250);
    return () => {
      clearTimeout(timer);
      controller.abort();
    };
  }, [query, tagId, taggedEntryCount]);

  return (
    <div className="grid min-w-0 content-start gap-2">
      <Label htmlFor={id}>Добавить тег к записи</Label>
      <div className="relative">
        <Search aria-hidden className="pointer-events-none absolute left-3 top-1/2 z-10 size-4 -translate-y-1/2 text-stone-400" />
        <SearchInput id={id} className="pl-9" value={text} maxLength={200}
          placeholder="Найти запись по названию" onChange={(event) => setText(event.currentTarget.value)} />
      </div>
      {query && state.query === query ? (
        <p role={state.error ? "alert" : "status"} className="text-xs text-stone-600">
          {state.error ?? "Редакционный тег закреплён."}
        </p>
      ) : null}
      {query.length >= 2 && (
        current?.items.length ? (
          <ul aria-label="Найденные записи" className="grid max-h-72 divide-y divide-stone-100 overflow-auto rounded-md border border-stone-200">
            {current.items.map((item) => (
              <li key={item.id} className="flex min-w-0 items-center justify-between gap-3 p-2">
                <div className="min-w-0 break-words text-sm">
                  <div className="font-medium">{item.label}</div>
                  <div className="text-xs text-stone-500">
                    {[item.mediaTypeName, item.releaseYear].filter((value) => value != null).join(" · ")}
                  </div>
                </div>
                <form action={action} className="shrink-0">
                  <input type="hidden" name="mediaItemId" value={item.id} />
                  <Button type="submit" variant="outline" size="icon" disabled={pending}
                    aria-label={`Добавить редакционный тег к записи «${item.label}»`} title="Добавить редакционный тег">
                    <Plus aria-hidden />
                  </Button>
                </form>
              </li>
            ))}
          </ul>
        ) : (
          <p role={current?.error ? "alert" : "status"} className="text-sm text-stone-500">
            {!current ? "Поиск…" : current.error ? "Не удалось найти записи." : "Ничего не найдено."}
          </p>
        )
      )}
    </div>
  );
}
