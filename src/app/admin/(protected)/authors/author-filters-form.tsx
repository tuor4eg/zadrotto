"use client";

import { useCallback, useTransition } from "react";
import { usePathname, useRouter, useSearchParams } from "next/navigation";

import { Select } from "@/components/ui/form";
import type { AuthorActivityFilter } from "@/db/queries/authors";

type AuthorFiltersFormProps = {
  accessProfileFilter: number | null;
  accessProfiles: Array<{
    id: number;
    name: string;
  }>;
  activityFilter: AuthorActivityFilter | "all";
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

export function AuthorFiltersForm({
  accessProfileFilter,
  accessProfiles,
  activityFilter,
}: AuthorFiltersFormProps) {
  const pathname = usePathname();
  const router = useRouter();
  const searchParams = useSearchParams();
  const [, startTransition] = useTransition();

  const replaceFilters = useCallback(
    (nextFilters: {
      activity?: AuthorActivityFilter | "all";
      profile?: number | null;
    }) => {
      const nextSearchParams = new URLSearchParams(searchParams.toString());

      nextSearchParams.delete("created");
      nextSearchParams.delete("error");
      nextSearchParams.delete("updated");

      if (nextFilters.activity !== undefined) {
        updateFilterParam(nextSearchParams, "activity", nextFilters.activity, "all");
      }

      if (nextFilters.profile !== undefined) {
        updateFilterParam(
          nextSearchParams,
          "profile",
          nextFilters.profile ? String(nextFilters.profile) : "",
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
        value={activityFilter}
        onChange={(event) =>
          replaceFilters({
            activity: event.target.value as AuthorActivityFilter | "all",
          })
        }
        aria-label="Фильтр по активности автора"
      >
        <option value="all">Все статусы</option>
        <option value="active">Активные</option>
        <option value="blocked">Неактивные</option>
      </Select>

      <Select
        value={accessProfileFilter ? String(accessProfileFilter) : ""}
        onChange={(event) =>
          replaceFilters({
            profile: event.target.value ? Number(event.target.value) : null,
          })
        }
        aria-label="Фильтр по типу автора"
      >
        <option value="">Все типы</option>
        {accessProfiles.map((profile) => (
          <option key={profile.id} value={profile.id}>
            {profile.name}
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
