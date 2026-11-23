"use client";

import { useEffect, useState } from "react";
import { normalizeSearchText } from "@/lib/search/normalize";

export type TagSearchOption = { id: number; title: string };

export function useTagSearch(query: string) {
  const search = normalizeSearchText(query);
  const [result, setResult] = useState<{ search: string; items: TagSearchOption[]; error?: string }>();

  useEffect(() => {
    if (!search) return;
    const controller = new AbortController();
    const timer = setTimeout(async () => {
      try {
        const response = await fetch(`/api/tags?q=${encodeURIComponent(search)}`, { signal: controller.signal });
        if (!response.ok) throw new Error("Tag search failed");
        const { items } = await response.json() as { items: TagSearchOption[] };
        if (!controller.signal.aborted) setResult({ search, items });
      } catch {
        if (!controller.signal.aborted) setResult({ search, items: [], error: "Не удалось найти теги." });
      }
    }, 250);
    return () => {
      clearTimeout(timer);
      controller.abort();
    };
  }, [search]);

  return search && result?.search === search ? result : undefined;
}
