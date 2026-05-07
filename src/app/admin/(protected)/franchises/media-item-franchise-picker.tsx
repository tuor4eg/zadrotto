"use client";

import { useMemo, useState } from "react";
import { AlertTriangle, Plus, Search, X } from "lucide-react";

import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/form";
import { Tooltip } from "@/components/ui/tooltip";
import { type getAdminMediaItemsAvailableForFranchise } from "@/db/queries/franchises";
import { MEDIA_TYPE_LABELS } from "@/lib/media-types";
import { PUBLICATION_STATUS_VALUE_LABELS } from "@/lib/publication-status";
import { addMediaItemToFranchiseAction } from "./actions";

type AvailableMediaItem = Awaited<
  ReturnType<typeof getAdminMediaItemsAvailableForFranchise>
>[number];

type MediaItemFranchisePickerProps = {
  franchiseId: number;
  items: AvailableMediaItem[];
};

function normalizeSearchValue(value: string) {
  return value.trim().toLowerCase();
}

function itemMatchesSearch(item: AvailableMediaItem, searchValue: string) {
  const searchableText = [
    item.title,
    item.originalTitle,
    item.code,
    item.franchiseTitle,
    item.releaseYear?.toString(),
    MEDIA_TYPE_LABELS[item.mediaType],
    PUBLICATION_STATUS_VALUE_LABELS[item.publicationStatus],
  ]
    .filter(Boolean)
    .join(" ")
    .toLowerCase();

  return searchableText.includes(searchValue);
}

export function MediaItemFranchisePicker({
  franchiseId,
  items,
}: MediaItemFranchisePickerProps) {
  const [searchValue, setSearchValue] = useState("");
  const [itemToMove, setItemToMove] = useState<AvailableMediaItem | null>(null);
  const normalizedSearchValue = normalizeSearchValue(searchValue);
  const visibleItems = useMemo(() => {
    if (!normalizedSearchValue) {
      return [];
    }

    return items
      .filter((item) => itemMatchesSearch(item, normalizedSearchValue))
      .slice(0, 8);
  }, [items, normalizedSearchValue]);

  return (
    <div className="mb-5 rounded-lg border border-stone-200 bg-stone-50/70 p-3">
      <div className="relative">
        <Search className="pointer-events-none absolute left-3 top-1/2 size-4 -translate-y-1/2 text-stone-400" />
        <Input
          type="search"
          value={searchValue}
          onChange={(event) => setSearchValue(event.target.value)}
          placeholder="Найти запись для добавления"
          className="pl-9"
        />
      </div>

      {items.length === 0 ? (
        <p className="mt-3 text-sm text-stone-500">Все записи уже в этой серии.</p>
      ) : !normalizedSearchValue ? (
        <p className="mt-3 text-sm text-stone-500">Начни вводить название, оригинал или код.</p>
      ) : visibleItems.length === 0 ? (
        <p className="mt-3 text-sm text-stone-500">По этому поиску записей нет.</p>
      ) : (
        <div className="mt-3 divide-y divide-stone-200 rounded-lg border border-stone-200 bg-white">
          {visibleItems.map((item) => (
            <div key={item.id} className="flex items-start gap-2 p-3">
              <div className="min-w-0 flex-1">
                <div className="truncate text-sm font-medium text-stone-950">{item.title}</div>
                {item.originalTitle ? (
                  <div className="mt-1 truncate text-xs text-stone-500">{item.originalTitle}</div>
                ) : null}
                <div className="mt-2 flex flex-wrap gap-2">
                  <Badge variant="outline">{MEDIA_TYPE_LABELS[item.mediaType]}</Badge>
                  {item.releaseYear ? <Badge variant="outline">{item.releaseYear}</Badge> : null}
                  {item.franchiseTitle ? (
                    <Badge variant="default">Сейчас: {item.franchiseTitle}</Badge>
                  ) : null}
                </div>
              </div>

              <form
                action={addMediaItemToFranchiseAction}
                className="shrink-0"
                onSubmit={(event) => {
                  if (item.franchiseTitle) {
                    event.preventDefault();
                    setItemToMove(item);
                  }
                }}
              >
                <input type="hidden" name="franchiseId" value={franchiseId} />
                <input type="hidden" name="mediaItemId" value={item.id} />
                <Tooltip label="Добавить в серию">
                  <Button
                    type="submit"
                    variant="positive"
                    size="icon"
                    aria-label={`Добавить запись ${item.title} в серию`}
                  >
                    <Plus />
                  </Button>
                </Tooltip>
              </form>
            </div>
          ))}
        </div>
      )}

      {itemToMove ? (
        <div
          aria-labelledby="move-media-item-title"
          aria-modal="true"
          className="fixed inset-0 z-50 grid place-items-center bg-stone-950/35 p-4"
          role="dialog"
        >
          <div className="w-full max-w-md rounded-lg border border-stone-200 bg-white p-5 shadow-xl">
            <div className="flex items-start gap-3">
              <div className="flex size-9 shrink-0 items-center justify-center rounded-md bg-amber-50 text-amber-700">
                <AlertTriangle className="size-4" />
              </div>
              <div className="min-w-0 flex-1">
                <div
                  id="move-media-item-title"
                  className="text-base font-semibold text-stone-950"
                >
                  Перенести запись в эту серию?
                </div>
                <p className="mt-2 text-sm leading-6 text-stone-600">
                  Запись <span className="font-medium text-stone-950">{itemToMove.title}</span>{" "}
                  уже находится в серии{" "}
                  <span className="font-medium text-stone-950">{itemToMove.franchiseTitle}</span>.
                  После переноса она будет убрана из старой серии.
                </p>
              </div>
              <Button
                type="button"
                variant="ghost"
                size="icon"
                aria-label="Закрыть диалог"
                onClick={() => setItemToMove(null)}
              >
                <X />
              </Button>
            </div>

            <div className="mt-5 flex justify-end gap-2">
              <Button
                type="button"
                variant="outline"
                onClick={() => setItemToMove(null)}
              >
                Отмена
              </Button>
              <form action={addMediaItemToFranchiseAction}>
                <input type="hidden" name="franchiseId" value={franchiseId} />
                <input type="hidden" name="mediaItemId" value={itemToMove.id} />
                <Button type="submit" variant="positive">
                  <Plus />
                  Перенести
                </Button>
              </form>
            </div>
          </div>
        </div>
      ) : null}
    </div>
  );
}
