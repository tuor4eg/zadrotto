"use client";

import { useMemo, useState } from "react";
import { Plus, Search } from "lucide-react";

import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/form";
import { Tooltip } from "@/components/ui/tooltip";
import { type getAdminMediaItemsAvailableForFranchise } from "@/db/queries/franchises";
import { getMediaTypeLabel, type MediaTypeOption } from "@/lib/media/types";
import { PUBLICATION_STATUS_VALUE_LABELS } from "@/lib/media/publication-status";
import { addMediaItemToFranchiseAction } from "./actions";

type AvailableMediaItem = Awaited<
  ReturnType<typeof getAdminMediaItemsAvailableForFranchise>
>[number];

type MediaItemFranchisePickerProps = {
  franchiseId: number;
  items: AvailableMediaItem[];
  mediaTypes: MediaTypeOption[];
};

function normalizeSearchValue(value: string) {
  return value.trim().toLowerCase();
}

function itemMatchesSearch(
  item: AvailableMediaItem,
  searchValue: string,
  mediaTypes: MediaTypeOption[],
) {
  const searchableText = [
    item.title,
    item.originalTitle,
    ...item.aliases,
    item.code,
    ...item.franchises.map((franchise) => franchise.title),
    item.releaseYear?.toString(),
    getMediaTypeLabel(item.mediaType, mediaTypes),
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
  mediaTypes,
}: MediaItemFranchisePickerProps) {
  const [searchValue, setSearchValue] = useState("");
  const normalizedSearchValue = normalizeSearchValue(searchValue);
  const visibleItems = useMemo(() => {
    if (!normalizedSearchValue) {
      return [];
    }

    return items
      .filter((item) => itemMatchesSearch(item, normalizedSearchValue, mediaTypes))
      .slice(0, 8);
  }, [items, mediaTypes, normalizedSearchValue]);

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
        <p className="mt-3 text-sm text-stone-500">Начни вводить название или оригинал.</p>
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
                  <Badge variant="outline">{getMediaTypeLabel(item.mediaType, mediaTypes)}</Badge>
                  {item.releaseYear ? <Badge variant="outline">{item.releaseYear}</Badge> : null}
                  {item.franchises.map((franchise) => (
                    <Badge key={franchise.id} variant="default">{franchise.title}</Badge>
                  ))}
                </div>
              </div>

              <form action={addMediaItemToFranchiseAction} className="shrink-0">
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
    </div>
  );
}
