"use client";

import Link from "next/link";
import { createContext, useContext, useMemo, useState, type ReactNode } from "react";

import type { FranchiseBranchNode } from "@/db/queries/franchises";
import { formatMediaItemsCount } from "@/app/series/series-format";
import { filterChildSeries } from "../child-series";

type ChildSeriesCatalogContextValue = {
  filteredSeries: FranchiseBranchNode[];
  searchQuery: string;
  setSearchQuery: (value: string) => void;
};

const ChildSeriesCatalogContext = createContext<ChildSeriesCatalogContextValue | null>(null);

function useChildSeriesCatalog() {
  const context = useContext(ChildSeriesCatalogContext);

  if (!context) throw new Error("ChildSeriesCatalogProvider is missing");

  return context;
}

export function ChildSeriesCatalogProvider({
  children,
  series,
}: {
  children: ReactNode;
  series: FranchiseBranchNode[];
}) {
  const [searchQuery, setSearchQuery] = useState("");
  const filteredSeries = useMemo(
    () => filterChildSeries(series, searchQuery),
    [series, searchQuery],
  );
  const value = useMemo(
    () => ({ filteredSeries, searchQuery, setSearchQuery }),
    [filteredSeries, searchQuery],
  );

  return (
    <ChildSeriesCatalogContext.Provider value={value}>
      {children}
    </ChildSeriesCatalogContext.Provider>
  );
}

export function ChildSeriesSearch() {
  const { searchQuery, setSearchQuery } = useChildSeriesCatalog();

  return (
    <div className="mt-5">
      <label className="sr-only" htmlFor="child-series-search">
        Поиск по дочерним сериям
      </label>
      <input
        className="h-10 w-full rounded-md border border-stone-300/80 bg-stone-50/70 px-3 font-mono text-sm text-stone-900 outline-none transition-colors placeholder:text-stone-400 focus:border-stone-950"
        id="child-series-search"
        onChange={(event) => setSearchQuery(event.target.value)}
        placeholder="Название серии"
        type="search"
        value={searchQuery}
      />
    </div>
  );
}

export function ChildSeriesGrid() {
  const { filteredSeries } = useChildSeriesCatalog();

  return filteredSeries.length > 0 ? (
    <ul className="grid grid-cols-1 gap-2 sm:grid-cols-2 lg:grid-cols-3">
      {filteredSeries.map((child) => (
        <li key={child.id} className="min-w-0">
          <Link
            className="group flex h-full min-w-0 items-center justify-between gap-4 rounded-md border border-stone-300/80 bg-stone-50/40 px-4 py-3 transition-colors hover:bg-stone-50/80"
            href={`/series/${child.code}`}
          >
            <span className="min-w-0">
              <span className="block break-words font-serif text-lg leading-tight text-stone-950 group-hover:underline group-hover:decoration-stone-400 group-hover:underline-offset-4">
                {child.title}
              </span>
              {child.originalTitle && child.originalTitle !== child.title ? (
                <span className="mt-1 block break-words font-mono text-[0.65rem] uppercase tracking-[0.08em] text-stone-500">
                  {child.originalTitle}
                </span>
              ) : null}
            </span>
            <span className="shrink-0 font-mono text-[0.65rem] uppercase tracking-[0.1em] text-stone-600">
              {formatMediaItemsCount(child.mediaItemsCount)}
            </span>
          </Link>
        </li>
      ))}
    </ul>
  ) : (
    <div className="rounded-md border border-stone-300/80 bg-stone-50/45 p-5 text-sm text-stone-600">
      По вашему запросу дочерние серии не найдены.
    </div>
  );
}
