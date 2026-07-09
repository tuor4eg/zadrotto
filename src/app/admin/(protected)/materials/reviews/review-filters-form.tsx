"use client";

import { useCallback, useTransition } from "react";
import { usePathname, useRouter, useSearchParams } from "next/navigation";

import { Select } from "@/components/ui/form";

type ReviewFiltersFormProps = {
  authorFilter: number | null;
  authors: Array<{
    id: number;
    name: string;
  }>;
  status: string;
  statusOptions: Array<{
    label: string;
    value: string;
  }>;
};

function updateFilterParam(
  searchParams: URLSearchParams,
  key: string,
  value: string,
  emptyValue: string,
) {
  if (value === emptyValue || value.trim() === "") {
    searchParams.delete(key);
    return;
  }

  searchParams.set(key, value);
}

export function ReviewFiltersForm({
  authorFilter,
  authors,
  status,
  statusOptions,
}: ReviewFiltersFormProps) {
  const pathname = usePathname();
  const router = useRouter();
  const searchParams = useSearchParams();
  const [, startTransition] = useTransition();

  const replaceFilters = useCallback(
    (nextFilters: { author?: number | null; status?: string }) => {
      const nextSearchParams = new URLSearchParams(searchParams.toString());

      if (nextFilters.status !== undefined) {
        updateFilterParam(nextSearchParams, "status", nextFilters.status, "all");
      }

      if (nextFilters.author !== undefined) {
        updateFilterParam(
          nextSearchParams,
          "author",
          nextFilters.author ? String(nextFilters.author) : "",
          "",
        );
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
    startTransition(() => {
      router.replace(pathname, { scroll: false });
    });
  }

  return (
    <div className="grid gap-3 rounded-lg border border-stone-200 bg-white p-4 sm:grid-cols-[minmax(0,220px)_minmax(0,260px)_auto]">
      <Select
        value={status}
        onChange={(event) => replaceFilters({ status: event.target.value })}
        aria-label="Фильтр по статусу рецензий"
      >
        {statusOptions.map((option) => (
          <option key={option.value} value={option.value}>
            {option.label}
          </option>
        ))}
      </Select>

      <Select
        value={authorFilter ? String(authorFilter) : ""}
        onChange={(event) =>
          replaceFilters({
            author: event.target.value ? Number(event.target.value) : null,
          })
        }
        aria-label="Фильтр по автору"
      >
        <option value="">Все авторы</option>
        {authors.map((author) => (
          <option key={author.id} value={author.id}>
            {author.name}
          </option>
        ))}
      </Select>

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
