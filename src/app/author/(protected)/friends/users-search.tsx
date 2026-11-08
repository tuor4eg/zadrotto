"use client";

import { Search } from "lucide-react";
import { usePathname, useRouter, useSearchParams } from "next/navigation";
import { useCallback, useTransition } from "react";

import { startRouteTransitionProgress } from "@/components/ui/route-transition-progress";
import { useDebouncedSearchDraft } from "@/lib/common/use-debounced-search-draft";
import { normalizeSearchText } from "@/lib/search/normalize";

export function UsersSearch({ searchQuery }: { searchQuery: string }) {
  const pathname = usePathname();
  const router = useRouter();
  const searchParams = useSearchParams();
  const [, startTransition] = useTransition();
  const handleSearch = useCallback((query: string) => {
    const normalizedQuery = normalizeSearchText(query);
    if (normalizedQuery === normalizeSearchText(searchParams.get("q") ?? "")) return;
    const params = new URLSearchParams(searchParams.toString());
    params.set("tab", "search");
    params.delete("page");
    params.delete("friendship");
    if (normalizedQuery) params.set("q", normalizedQuery);
    else params.delete("q");
    startRouteTransitionProgress();
    startTransition(() => router.replace(`${pathname}?${params.toString()}`, { scroll: false }));
  }, [pathname, router, searchParams]);
  const { draft, setDraft } = useDebouncedSearchDraft({ searchQuery, onSearch: handleSearch });

  return <div className="relative w-full max-w-xl">
    <label className="sr-only" htmlFor="friends-users-search">Поиск пользователей</label>
    <Search aria-hidden="true" className="pointer-events-none absolute left-3 top-1/2 size-3.5 -translate-y-1/2 text-stone-500" />
    <input
      id="friends-users-search"
      type="search"
      value={draft}
      onChange={(event) => setDraft(event.target.value)}
      placeholder="Имя пользователя"
      className="archive-control-surface archive-search-input h-9 min-w-0 w-full appearance-none rounded-md border border-stone-300/80 pl-9 pr-3 text-base text-stone-950 shadow-[inset_0_1px_1px_rgba(68,64,60,0.08)] outline-none placeholder:text-stone-500 focus:border-stone-700"
    />
  </div>;
}
