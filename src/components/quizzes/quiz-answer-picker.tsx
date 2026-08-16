"use client";

import { useEffect, useState } from "react";

type Item = {
  id: number;
  title: string;
  originalTitle: string | null;
  releaseYear: number | null;
  mediaType: string;
};

export function QuizAnswerPicker({ initial }: { initial?: Item | null }) {
  const [query, setQuery] = useState(initial?.title ?? "");
  const [items, setItems] = useState<Item[]>(initial ? [initial] : []);
  const [selected, setSelected] = useState(initial ?? null);

  useEffect(() => {
    const normalizedQuery = query.trim();

    if (normalizedQuery.length < 2 || normalizedQuery === selected?.title) {
      return;
    }

    const controller = new AbortController();
    const timer = window.setTimeout(() => {
      void fetch(
        `/api/admin/quizzes/title-search?q=${encodeURIComponent(normalizedQuery)}`,
        { signal: controller.signal },
      )
        .then(async (response) => {
          if (!response.ok || controller.signal.aborted) return;
          const payload = await response.json() as { items?: Item[] };
          if (!controller.signal.aborted) setItems(payload.items ?? []);
        })
        .catch((error: unknown) => {
          if (controller.signal.aborted || (error instanceof DOMException && error.name === "AbortError")) {
            return;
          }
          console.error("Не удалось найти записи для квиза.", error);
          setItems([]);
        });
    }, 250);

    return () => {
      window.clearTimeout(timer);
      controller.abort();
    };
  }, [query, selected]);

  return (
    <div className="grid gap-2">
      <input type="hidden" name="answerMediaItemId" value={selected?.id ?? ""} />
      <input
        className="h-10 rounded-md border border-stone-300 px-3"
        value={query}
        onChange={(event) => {
          setQuery(event.target.value);
          setSelected(null);
        }}
        placeholder="Начните вводить название записи"
      />
      {query.trim().length >= 2 && !selected ? (
        <div className="max-h-52 overflow-auto rounded-md border bg-white p-1">
          {items.map((item) => (
            <button
              className="block w-full rounded px-3 py-2 text-left text-sm hover:bg-stone-100"
              type="button"
              key={item.id}
              onClick={() => {
                setSelected(item);
                setQuery(item.title);
              }}
            >
              {item.title}{item.releaseYear ? ` (${item.releaseYear})` : ""} · {item.mediaType}
            </button>
          ))}
        </div>
      ) : null}
      {selected ? (
        <p className="text-xs text-stone-600">
          Выбрана: {selected.title} · {selected.mediaType}
        </p>
      ) : null}
    </div>
  );
}
