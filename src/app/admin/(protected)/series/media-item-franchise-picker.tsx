"use client";

import { SearchInput } from "@/components/ui/search-input";

import { useEffect, useState } from "react";
import { Plus, Search } from "lucide-react";

import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";

import { Tooltip } from "@/components/ui/tooltip";
import { type searchAdminMediaItemsAvailableForFranchise } from "@/db/queries/franchises";
import { getMediaTypeLabel, type MediaTypeOption } from "@/lib/media/types";
import { normalizeSearchText } from "@/lib/search/normalize";
import { addMediaItemToFranchiseAction } from "./actions";

type AvailableMediaItem = Awaited<
  ReturnType<typeof searchAdminMediaItemsAvailableForFranchise>
>[number];

type MediaItemFranchisePickerProps = {
  franchiseId: number;
  membershipKey: string;
  mediaTypes: MediaTypeOption[];
};

export function MediaItemFranchisePicker({
  franchiseId,
  membershipKey,
  mediaTypes,
}: MediaItemFranchisePickerProps) {
  const [searchValue, setSearchValue] = useState("");
  const normalizedSearchValue = normalizeSearchText(searchValue);
  const searchKey = JSON.stringify([franchiseId, normalizedSearchValue, membershipKey]);
  const [result, setResult] = useState<{ key: string; items: AvailableMediaItem[]; error?: boolean }>();
  const currentResult = result?.key === searchKey ? result : undefined;
  const visibleItems = currentResult?.items ?? [];

  useEffect(() => {
    if (!normalizedSearchValue) return;
    const controller = new AbortController();
    const timer = setTimeout(async () => {
      const params = new URLSearchParams({ franchiseId: String(franchiseId), q: normalizedSearchValue });
      try {
        const response = await fetch(`/api/admin/series/media-search?${params}`, {
          signal: controller.signal,
          cache: "no-store",
        });
        if (!response.ok) throw new Error("Search failed");
        const items: AvailableMediaItem[] = await response.json();
        if (!controller.signal.aborted) setResult({ key: searchKey, items });
      } catch {
        if (!controller.signal.aborted) setResult({ key: searchKey, items: [], error: true });
      }
    }, 250);
    return () => {
      clearTimeout(timer);
      controller.abort();
    };
  }, [franchiseId, normalizedSearchValue, searchKey]);

  return (
    <div className="mb-5 rounded-lg border border-stone-200 bg-stone-50/70 p-3">
      <div className="relative">
        <Search className="pointer-events-none absolute z-10 left-3 top-1/2 size-4 -translate-y-1/2 text-stone-400" />
        <SearchInput
          type="search"
          value={searchValue}
          onChange={(event) => setSearchValue(event.target.value)}
          placeholder="Найти запись для добавления"
          className="pl-9"
          maxLength={200}
        />
      </div>

      {!normalizedSearchValue ? (
        <p className="mt-3 text-sm text-stone-500">Начни вводить название или оригинал.</p>
      ) : !currentResult ? (
        <p role="status" className="mt-3 text-sm text-stone-500">Поиск…</p>
      ) : currentResult.error ? (
        <p role="alert" className="mt-3 text-sm text-red-700">Не удалось найти записи. Измените запрос и попробуйте снова.</p>
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
