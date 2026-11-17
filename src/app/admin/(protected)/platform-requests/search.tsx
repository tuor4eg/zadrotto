"use client";

import { SearchInput } from "@/components/ui/search-input";

import { useRouter } from "next/navigation";

import { useDebouncedSearchDraft } from "@/lib/common/use-debounced-search-draft";

export function PlatformRequestSearch({ searchQuery, all }: { searchQuery: string; all: boolean }) {
  const router = useRouter();
  const { draft, setDraft } = useDebouncedSearchDraft({ searchQuery, onSearch: (query) => {
    const params = new URLSearchParams();
    if (all) params.set("tab", "all");
    if (query) params.set("q", query);
    const suffix = params.toString();
    router.replace(suffix ? `/admin/platform-requests?${suffix}` : "/admin/platform-requests", { scroll: false });
  } });
  return <SearchInput containerClassName="sm:max-w-md" type="search" value={draft} onChange={(event) => setDraft(event.target.value)}
    aria-label="Поиск заявок на платформы" placeholder="Название платформы у провайдера" className="" />;
}
