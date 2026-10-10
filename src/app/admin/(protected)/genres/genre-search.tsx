"use client";

import { useRouter } from "next/navigation";
import { Input } from "@/components/ui/form";
import { useDebouncedSearchDraft } from "@/lib/common/use-debounced-search-draft";

export function GenreSearch({ searchQuery, cancelled = false }: { searchQuery: string; cancelled?: boolean }) {
  const router = useRouter();
  const { draft, setDraft } = useDebouncedSearchDraft({
    searchQuery,
    onSearch: (query) => {
      const params = new URLSearchParams();
      if (cancelled) params.set("tab", "cancelled");
      if (query) params.set("q", query);
      const suffix = params.toString();
      router.replace(suffix ? `/admin/genres?${suffix}` : "/admin/genres", { scroll: false });
    },
  });
  return <Input type="search" value={draft} onChange={(event) => setDraft(event.target.value)}
    aria-label="Поиск жанров" placeholder="Название, код или вариант у провайдера" className="sm:max-w-md" />;
}
