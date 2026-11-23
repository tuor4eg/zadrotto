"use client";

import { Select } from "@/components/ui/form";
import type { AdminTagStatus } from "@/lib/tags/model";
import { useRouter } from "next/navigation";
import { SearchInput } from "@/components/ui/search-input";
import { useDebouncedSearchDraft } from "@/lib/common/use-debounced-search-draft";

export function TagSearch({ searchQuery, status }: { searchQuery: string; status: AdminTagStatus }) {
  const router = useRouter();
  const { draft, setDraft } = useDebouncedSearchDraft({
    searchQuery,
    onSearch: query => {
      const params = new URLSearchParams();
      if (query) params.set("q", query);
      if (status !== "all") params.set("status", status);
      const suffix = params.toString();
      router.replace(suffix ? `/admin/tags?${suffix}` : "/admin/tags", { scroll: false });
    },
  });
  return <div className="flex flex-wrap items-center gap-3">
    <SearchInput containerClassName="min-w-0 flex-1 sm:max-w-md" value={draft} onChange={event => setDraft(event.target.value)} aria-label="Поиск тегов" placeholder="Название тега" />
    <Select aria-label="Статус тегов" className="w-auto" value={status} onChange={event => {
      const params = new URLSearchParams();
      if (draft.trim()) params.set("q", draft.trim());
      if (event.target.value !== "all") params.set("status", event.target.value);
      router.replace(params.size ? `/admin/tags?${params}` : "/admin/tags", { scroll: false });
    }}>
      <option value="all">Все</option>
      <option value="system">Редакционные</option>
      <option value="ordinary">Обычные</option>
    </Select>
  </div>;
}
