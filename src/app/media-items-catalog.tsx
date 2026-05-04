"use client";

import { useMemo, useState } from "react";

import type { CatalogMediaItem } from "@/db/queries/media-items";

type MediaItemsCatalogProps = {
  items: CatalogMediaItem[];
};

function formatScore(score: number | null) {
  return score === null ? "—" : (score / 10).toFixed(1);
}

export function MediaItemsCatalog({ items }: MediaItemsCatalogProps) {
  const [selectedId, setSelectedId] = useState(items[0]?.id);
  const selectedItem = useMemo(
    () => items.find((item) => item.id === selectedId) ?? items[0],
    [items, selectedId],
  );

  if (items.length === 0) {
    return (
      <div className="border border-zinc-300 bg-white p-5 text-sm text-zinc-500">
        Пока в архиве нет тайтлов.
      </div>
    );
  }

  return (
    <section className="grid gap-5 lg:grid-cols-[minmax(0,0.9fr)_minmax(0,1.45fr)]">
      <div className="border border-zinc-300 bg-white">
        <div className="border-b border-zinc-200 px-4 py-3">
          <h2 className="text-xs font-semibold uppercase tracking-[0.18em] text-zinc-500">
            Картотека
          </h2>
        </div>
        <div className="divide-y divide-zinc-200">
          {items.map((item) => {
            const isSelected = item.id === selectedItem.id;

            return (
              <button
                key={item.id}
                type="button"
                onClick={() => setSelectedId(item.id)}
                className={`grid w-full grid-cols-[minmax(0,1fr)_auto] gap-3 px-4 py-3 text-left transition-colors ${
                  isSelected
                    ? "bg-zinc-950 text-white"
                    : "bg-white text-zinc-900 hover:bg-zinc-100"
                }`}
                aria-pressed={isSelected}
              >
                <span className="min-w-0">
                  <span className="block truncate text-sm font-medium">{item.title}</span>
                  <span
                    className={`mt-1 block text-xs uppercase tracking-[0.14em] ${
                      isSelected ? "text-zinc-300" : "text-zinc-500"
                    }`}
                  >
                    {item.mediaType}
                  </span>
                </span>
                <span
                  className={`flex shrink-0 flex-col items-end gap-1 text-xs font-medium tabular-nums ${
                    isSelected ? "text-zinc-300" : "text-zinc-500"
                  }`}
                >
                  <span>{formatScore(item.averageScore)}</span>
                  {item.releaseYear ? <span>{item.releaseYear}</span> : null}
                </span>
              </button>
            );
          })}
        </div>
      </div>

      <article className="border border-zinc-300 bg-white">
        <div className="grid gap-0 sm:grid-cols-[220px_minmax(0,1fr)]">
          <div className="aspect-[4/3] bg-zinc-200 sm:aspect-auto sm:min-h-[320px]">
            {selectedItem.coverUrl ? (
              // eslint-disable-next-line @next/next/no-img-element
              <img
                src={selectedItem.coverUrl}
                alt={`Обложка: ${selectedItem.title}`}
                className="h-full w-full object-cover"
              />
            ) : (
              <div className="flex h-full w-full items-center justify-center bg-[linear-gradient(135deg,#e4e4e7,#fafafa)] px-6 text-center text-xs font-semibold uppercase tracking-[0.2em] text-zinc-400">
                No cover
              </div>
            )}
          </div>

          <div className="flex min-h-[320px] flex-col justify-between gap-8 p-5 sm:p-6">
            <div className="flex flex-col gap-3">
              <div className="flex flex-wrap gap-2 text-xs font-semibold uppercase tracking-[0.16em] text-red-700">
                <span>{selectedItem.mediaType}</span>
                {selectedItem.releaseYear ? <span>{selectedItem.releaseYear}</span> : null}
              </div>

              <div className="flex flex-col gap-2">
                <h2 className="text-3xl font-semibold leading-tight text-zinc-950">
                  {selectedItem.title}
                </h2>
                {selectedItem.originalTitle &&
                selectedItem.originalTitle !== selectedItem.title ? (
                  <p className="text-base text-zinc-500">{selectedItem.originalTitle}</p>
                ) : null}
              </div>

              <div className="w-fit border border-zinc-300 px-3 py-2">
                <span className="block text-[10px] font-semibold uppercase tracking-[0.16em] text-zinc-400">
                  Средний рейтинг
                </span>
                <span className="mt-1 block text-2xl font-semibold tabular-nums text-zinc-950">
                  {formatScore(selectedItem.averageScore)}
                </span>
              </div>
            </div>

            <div className="border-t border-zinc-200 pt-4 text-xs uppercase tracking-[0.16em] text-zinc-400">
              #{selectedItem.id.toString().padStart(4, "0")}
            </div>
          </div>
        </div>
      </article>
    </section>
  );
}
