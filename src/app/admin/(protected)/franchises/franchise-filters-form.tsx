"use client";

import { useCallback, useEffect, useRef, useState, useTransition } from "react";
import { usePathname, useRouter, useSearchParams } from "next/navigation";

import { Input } from "@/components/ui/form";

type AdminFranchiseFiltersFormProps = {
  searchQuery: string;
};

function updateFilterParam(searchParams: URLSearchParams, key: string, value: string) {
  if (value.trim() === "") {
    searchParams.delete(key);
    return;
  }

  searchParams.set(key, value);
}

export function AdminFranchiseFiltersForm({
  searchQuery,
}: AdminFranchiseFiltersFormProps) {
  const pathname = usePathname();
  const router = useRouter();
  const searchParams = useSearchParams();
  const [search, setSearch] = useState(searchQuery);
  const [, startTransition] = useTransition();
  const isFirstSearchSync = useRef(true);
  const previousSearchQuery = useRef(searchQuery);

  const replaceFilters = useCallback(
    (nextFilters: {
      q?: string;
    }) => {
      const nextSearchParams = new URLSearchParams(searchParams.toString());

      nextSearchParams.delete("created");
      nextSearchParams.delete("deleted");
      nextSearchParams.delete("error");
      nextSearchParams.delete("page");

      if (nextFilters.q !== undefined) {
        updateFilterParam(nextSearchParams, "q", nextFilters.q);
      }

      const queryString = nextSearchParams.toString();

      if (queryString === searchParams.toString()) {
        return;
      }

      startTransition(() => {
        router.replace(queryString ? `${pathname}?${queryString}` : pathname, { scroll: false });
      });
    },
    [pathname, router, searchParams],
  );

  function resetFilters() {
    setSearch("");
    startTransition(() => {
      router.replace(pathname, { scroll: false });
    });
  }

  useEffect(() => {
    if (previousSearchQuery.current !== searchQuery) {
      previousSearchQuery.current = searchQuery;
      setSearch(searchQuery);
      return;
    }

    if (isFirstSearchSync.current) {
      isFirstSearchSync.current = false;
      return;
    }

    if (search === searchQuery) {
      return;
    }

    const timeoutId = window.setTimeout(() => {
      replaceFilters({ q: search });
    }, 250);

    return () => window.clearTimeout(timeoutId);
  }, [replaceFilters, search, searchQuery]);

  return (
    <div className="grid gap-3 rounded-lg border border-stone-200 bg-white p-4 sm:grid-cols-[minmax(220px,1fr)_auto]">
      <Input
        type="search"
        value={search}
        onChange={(event) => setSearch(event.target.value)}
        placeholder="Название, оригинал или код"
        aria-label="Поиск серий"
      />

      <button
        type="button"
        onClick={resetFilters}
        className="flex h-10 items-center justify-center rounded-md border border-stone-200 bg-white px-4 text-sm font-medium text-stone-600 transition-colors hover:border-stone-400 hover:text-stone-950"
      >
        Сбросить
      </button>
    </div>
  );
}
