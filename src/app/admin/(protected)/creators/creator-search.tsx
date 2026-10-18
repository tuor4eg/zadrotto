"use client";

import { useRouter } from "next/navigation";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/form";
import { useDebouncedSearchDraft } from "@/lib/common/use-debounced-search-draft";

export function CreatorSearch({ searchQuery }: { searchQuery: string }) {
  const router = useRouter();
  const { draft, setDraft, resetDraft } = useDebouncedSearchDraft({
    searchQuery,
    onSearch: (query) => {
      const params = new URLSearchParams();
      if (query) params.set("q", query);
      const suffix = params.toString();
      router.replace(suffix ? `/admin/creators?${suffix}` : "/admin/creators", { scroll: false });
    },
  });

  return <div className="flex gap-2">
    <Input type="search" value={draft} onChange={(event) => setDraft(event.target.value)}
      placeholder="Поиск по имени" aria-label="Поиск создателей" className="max-w-md" />
    {draft ? <Button type="button" variant="ghost" onClick={() => resetDraft()}>Сбросить</Button> : null}
  </div>;
}
