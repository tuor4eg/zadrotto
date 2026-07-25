"use client";

import { useCallback, useTransition } from "react";
import { usePathname, useRouter, useSearchParams } from "next/navigation";

import { useDebouncedSearchDraft } from "@/lib/common/use-debounced-search-draft";

type SeriesSearchProps = {
  searchQuery: string;
};

export function SeriesSearch({ searchQuery }: SeriesSearchProps) {
  const pathname = usePathname();
  const router = useRouter();
  const searchParams = useSearchParams();
  const [, startTransition] = useTransition();
  const replaceSearch = useCallback(
    (query: string) => {
      const nextSearchParams = new URLSearchParams(searchParams.toString());
      const normalizedQuery = query.trim();

      nextSearchParams.delete("page");

      if (normalizedQuery) {
        nextSearchParams.set("q", normalizedQuery);
      } else {
        nextSearchParams.delete("q");
      }

      const queryString = nextSearchParams.toString();

      if (queryString === searchParams.toString()) {
        return;
      }

      startTransition(() => {
        router.replace(queryString ? `${pathname}?${queryString}` : pathname, {
          scroll: false,
        });
      });
    },
    [pathname, router, searchParams],
  );
  const handleSearch = useCallback(
    (query: string) => {
      const normalizedQuery = query.trim();
      const currentUrlQuery = searchParams.get("q")?.trim() ?? "";

      if (normalizedQuery === currentUrlQuery && normalizedQuery !== searchQuery) {
        startTransition(() => {
          router.refresh();
        });
        return;
      }

      replaceSearch(query);
    },
    [replaceSearch, router, searchParams, searchQuery],
  );
  const { draft, setDraft } = useDebouncedSearchDraft({
    searchQuery,
    onSearch: handleSearch,
  });

  return (
    <>
      <label className="sr-only" htmlFor="series-search">
        Поиск серий
      </label>
      <input
        className="mt-6 h-10 w-full rounded-md border border-stone-300/80 bg-stone-50/70 px-3 font-mono text-sm text-stone-900 outline-none transition-colors placeholder:text-stone-400 focus:border-stone-950"
        id="series-search"
        name="q"
        onChange={(event) => setDraft(event.target.value)}
        placeholder="Название серии"
        type="search"
        value={draft}
      />
    </>
  );
}
