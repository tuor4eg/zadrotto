"use client";

import { useRouter } from "next/navigation";
import { useRef, useTransition } from "react";

import { Input, Select } from "@/components/ui/form";
import { useDebouncedSearchDraft } from "@/lib/common/use-debounced-search-draft";

export function TierListFilters({ searchQuery, authorId, status }: {
  searchQuery: string;
  authorId: string;
  status: string;
}) {
  const router = useRouter();
  const filtersRef = useRef<HTMLDivElement>(null);
  const [pending, startTransition] = useTransition();

  function applyFilters(query: string) {
    const params = new URLSearchParams();
    if (query.trim()) params.set("q", query.trim());
    const author = filtersRef.current?.querySelector<HTMLInputElement>('[name="authorId"]')?.value ?? authorId;
    const selectedStatus = filtersRef.current?.querySelector<HTMLSelectElement>('[name="status"]')?.value ?? status;
    if (Number.isSafeInteger(Number(author)) && Number(author) > 0) params.set("authorId", author);
    if (selectedStatus) params.set("status", selectedStatus);
    const suffix = params.toString();
    startTransition(() => {
      router.replace(suffix ? `/admin/tier-lists?${suffix}` : "/admin/tier-lists", { scroll: false });
    });
  }

  const { draft, setDraft } = useDebouncedSearchDraft({ searchQuery, onSearch: applyFilters });

  return (
    <div ref={filtersRef} aria-busy={pending} className="grid gap-3 rounded-lg border border-stone-200 bg-white p-4 sm:grid-cols-2 xl:grid-cols-[minmax(0,280px)_minmax(0,180px)_minmax(0,220px)]">
      <Input
        aria-label="Название"
        type="search"
        name="q"
        value={draft}
        onChange={(event) => setDraft(event.target.value)}
        placeholder="Название тир-листа"
      />
      <Input
        key={`author-${authorId}`}
        aria-label="ID автора"
        name="authorId"
        type="number"
        min={1}
        defaultValue={authorId}
        onChange={() => applyFilters(draft)}
        placeholder="ID автора"
      />
      <Select key={`status-${status}`} aria-label="Статус" name="status" defaultValue={status} onChange={() => applyFilters(draft)}>
        <option value="">Все</option>
        <option value="draft">Черновики</option>
        <option value="published">Опубликованные</option>
        <option value="hidden">Скрытые</option>
      </Select>
    </div>
  );
}
