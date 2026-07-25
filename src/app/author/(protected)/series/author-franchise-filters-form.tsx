"use client";

import { useCallback, useTransition } from "react";
import { usePathname, useRouter, useSearchParams } from "next/navigation";

import { Button } from "@/components/ui/button";
import { Input, Label, Select } from "@/components/ui/form";
import { useDebouncedSearchDraft } from "@/lib/common/use-debounced-search-draft";
import {
  type AuthorFranchiseSubmissionStatusFilter,
} from "@/lib/authors/franchise-submission-filters";
import {
  PUBLICATION_STATUSES,
  PUBLICATION_STATUS_LABELS,
} from "@/lib/media/publication-status";

type AuthorFranchiseFiltersFormProps = {
  searchQuery: string;
  statusFilter: AuthorFranchiseSubmissionStatusFilter;
};

function updateFilterParam(searchParams: URLSearchParams, key: string, value: string) {
  if (value === "all" || value.trim() === "") {
    searchParams.delete(key);
    return;
  }

  searchParams.set(key, value);
}

export function AuthorFranchiseFiltersForm({
  searchQuery,
  statusFilter,
}: AuthorFranchiseFiltersFormProps) {
  const pathname = usePathname();
  const router = useRouter();
  const searchParams = useSearchParams();
  const [, startTransition] = useTransition();
  const replaceFilters = useCallback(
    (nextFilters: { q?: string; status?: AuthorFranchiseSubmissionStatusFilter }) => {
      const nextSearchParams = new URLSearchParams(searchParams.toString());

      nextSearchParams.delete("page");

      if (nextFilters.q !== undefined) {
        updateFilterParam(nextSearchParams, "q", nextFilters.q);
      }

      if (nextFilters.status !== undefined) {
        updateFilterParam(nextSearchParams, "status", nextFilters.status);
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
  const { draft: search, resetDraft: resetSearch, setDraft: setSearch } = useDebouncedSearchDraft({
    searchQuery,
    onSearch: (query) => replaceFilters({ q: query }),
  });

  function resetFilters() {
    resetSearch();
    startTransition(() => {
      router.replace(pathname, { scroll: false });
    });
  }

  return (
    <div className="grid gap-3 rounded-lg border border-stone-200 bg-white/80 p-3 shadow-sm md:grid-cols-[minmax(220px,1fr)_190px_auto]">
      <div className="flex flex-col gap-2">
        <Label htmlFor="author-franchise-search">Поиск</Label>
        <Input
          id="author-franchise-search"
          type="search"
          value={search}
          onChange={(event) => setSearch(event.target.value)}
          placeholder="Тайтл или серия"
        />
      </div>

      <div className="flex flex-col gap-2">
        <Label htmlFor="author-franchise-status-filter">Статус</Label>
        <Select
          id="author-franchise-status-filter"
          value={statusFilter}
          onChange={(event) =>
            replaceFilters({ status: event.target.value as AuthorFranchiseSubmissionStatusFilter })
          }
        >
          <option value="all">Все статусы</option>
          {PUBLICATION_STATUSES.map((status) => (
            <option key={status} value={status}>
              {PUBLICATION_STATUS_LABELS[status]}
            </option>
          ))}
        </Select>
      </div>

      <div className="flex items-end">
        <Button type="button" variant="outline" className="w-full" onClick={resetFilters}>
          Сбросить
        </Button>
      </div>
    </div>
  );
}
