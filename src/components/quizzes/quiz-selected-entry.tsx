"use client";

import { useEffect, useState } from "react";
import { EditorialEntryGroupTile } from "@/components/archive/editorial-entry-group-tile";
import type { EditorialCollectionGroupItem } from "@/db/queries/editorial-collections";
import { ARCHIVE_ONBOARDING_RATING_SAVED_EVENT, USER_HUD_REFRESH_EVENT } from "@/lib/onboarding/model";
import { Button } from "@/components/ui/button";
import { resolveMediaItemDisplayTitles } from "@/lib/media/display-titles";

type SelectedEntry = { entry: EditorialCollectionGroupItem; ratingAuthor: { name: string; code: string } };

export function QuizSelectedEntry({ quizId, mediaItemId }: { quizId: number; mediaItemId: number }) {
  const [preview, setPreview] = useState<SelectedEntry | null>(null);
  const [error, setError] = useState(false);
  const [retry, setRetry] = useState(0);
  useEffect(() => {
    let active = true;
    let request: AbortController | null = null;
    async function load() {
      request?.abort();
      const controller = new AbortController();
      request = controller;
      try {
        const response = await fetch(`/api/quizzes/${quizId}/entry?mediaItemId=${mediaItemId}`, { cache: "no-store", signal: controller.signal });
        if (!response.ok) throw new Error("entry-unavailable");
        const result = await response.json() as SelectedEntry;
        if (active && !controller.signal.aborted) { setPreview(result); setError(false); }
      } catch {
        if (active && !controller.signal.aborted) setError(true);
      }
    }
    const refresh = () => { void load(); };
    void load();
    window.addEventListener(ARCHIVE_ONBOARDING_RATING_SAVED_EVENT, refresh);
    window.addEventListener(USER_HUD_REFRESH_EVENT, refresh);
    window.addEventListener("focus", refresh);
    return () => {
      active = false;
      request?.abort();
      window.removeEventListener(ARCHIVE_ONBOARDING_RATING_SAVED_EVENT, refresh);
      window.removeEventListener(USER_HUD_REFRESH_EVENT, refresh);
      window.removeEventListener("focus", refresh);
    };
  }, [quizId, mediaItemId, retry]);

  return <div className="grid min-w-0 gap-2">
    {preview ? <div className="mx-auto w-32 min-w-0 sm:w-36 [&>div>p]:text-center">
      <EditorialEntryGroupTile
        item={{ ...preview.entry.item, title: resolveMediaItemDisplayTitles(preview.entry.item).displayTitle }}
        currentAuthorStatus={preview.entry.currentAuthorStatus}
        currentAuthor
        ratingAuthor={preview.ratingAuthor}
        horizontalScroll={false}
      />
    </div> : !error ? <p role="status" className="text-sm text-stone-500">Загружаем запись…</p> : null}
    {error ? <div role="alert" className="grid justify-items-start gap-2 text-sm text-red-800">
      <p>Не удалось загрузить запись.</p>
      <Button type="button" size="sm" variant="outline" onClick={() => setRetry((value) => value + 1)}>Повторить</Button>
    </div> : null}
  </div>;
}
