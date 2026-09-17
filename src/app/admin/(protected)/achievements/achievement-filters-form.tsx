"use client";

import { useCallback, useTransition } from "react";
import { usePathname, useRouter, useSearchParams } from "next/navigation";

import { Input, Select } from "@/components/ui/form";
import { useDebouncedSearchDraft } from "@/lib/common/use-debounced-search-draft";

type AchievementFiltersFormProps = {
  awardStatus: "all" | "awarded" | "unawarded";
  searchQuery: string;
  status: "all" | "enabled" | "disabled";
  visibility: "all" | "regular" | "secret";
};

function setFilter(searchParams: URLSearchParams, key: string, value: string) {
  if (!value.trim() || value === "all") searchParams.delete(key);
  else searchParams.set(key, value);
}

export function AchievementFiltersForm({ awardStatus, searchQuery, status, visibility }: AchievementFiltersFormProps) {
  const pathname = usePathname();
  const router = useRouter();
  const searchParams = useSearchParams();
  const [, startTransition] = useTransition();

  const replaceFilters = useCallback((next: { awardStatus?: string; q?: string; status?: string; visibility?: string }) => {
    const params = new URLSearchParams(searchParams.toString());
    params.delete("deleted");
    params.delete("disabled");
    params.delete("enabled");
    params.delete("error");
    params.delete("page");
    if (next.q !== undefined) setFilter(params, "q", next.q);
    if (next.awardStatus !== undefined) setFilter(params, "awardStatus", next.awardStatus);
    if (next.status !== undefined) setFilter(params, "status", next.status);
    if (next.visibility !== undefined) setFilter(params, "visibility", next.visibility);
    const query = params.toString();
    if (query === searchParams.toString()) return;
    startTransition(() => router.replace(query ? `${pathname}?${query}` : pathname, { scroll: false }));
  }, [pathname, router, searchParams]);

  const { draft, resetDraft, setDraft } = useDebouncedSearchDraft({
    searchQuery,
    onSearch: (q) => replaceFilters({ q }),
  });

  function resetFilters() {
    resetDraft();
    startTransition(() => router.replace(pathname, { scroll: false }));
  }

  return <div className="grid gap-3 rounded-md border border-stone-200 bg-white p-4 md:grid-cols-2 md:items-center xl:grid-cols-[minmax(240px,1fr)_200px_200px_200px_auto]">
    <Input aria-label="Поиск ачивок" type="search" value={draft} onChange={(event) => setDraft(event.currentTarget.value)} placeholder="Название, код или механика" />
    <Select aria-label="Фильтр по состоянию ачивок" value={status} onChange={(event) => replaceFilters({ status: event.currentTarget.value })}><option value="all">Все состояния</option><option value="enabled">Включённые</option><option value="disabled">Выключенные</option></Select>
    <Select aria-label="Фильтр по типу ачивок" value={visibility} onChange={(event) => replaceFilters({ visibility: event.currentTarget.value })}><option value="all">Все типы</option><option value="regular">Обычные</option><option value="secret">Тайные</option></Select>
    <Select aria-label="Фильтр по получению ачивок" value={awardStatus} onChange={(event) => replaceFilters({ awardStatus: event.currentTarget.value })}><option value="all">Все по получению</option><option value="awarded">Полученные</option><option value="unawarded">Не полученные</option></Select>
    <button type="button" onClick={resetFilters} className="flex h-10 items-center justify-center rounded-md border border-stone-200 bg-white px-4 text-sm font-medium text-stone-600 transition-colors hover:border-stone-400 hover:text-stone-950">Сбросить</button>
  </div>
}
