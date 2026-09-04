"use client";

import Link from "next/link";
import { useState } from "react";

import type { FranchiseTreeNode } from "@/db/queries/franchises";
import { getSeriesAlphabetGroup, getSeriesCountTier } from "@/lib/series/series-alphabet";

const COLLAPSED_CHILDREN_COUNT = 8;

const COUNT_BADGE_STYLES = {
  small: "size-6 text-[0.6rem]",
  medium: "size-7 text-xs font-semibold",
  large: "size-9 text-base font-bold",
} as const;

const TITLE_STYLES = {
  small: "text-base font-medium",
  medium: "text-xl font-semibold",
  large: "text-2xl font-semibold",
} as const;

function formatMediaItemsCount(count: number) {
  const plural = new Intl.PluralRules("ru-RU").select(count);
  const label = plural === "one" ? "запись" : plural === "few" ? "записи" : "записей";

  return `${count} ${label}`;
}

function SeriesCountBadge({ count }: { count: number }) {
  const tier = getSeriesCountTier(count);

  return (
    <span
      aria-label={formatMediaItemsCount(count)}
      className={`inline-flex shrink-0 items-center justify-center rounded-full border border-stone-400/55 bg-transparent font-mono leading-none text-stone-600 ${COUNT_BADGE_STYLES[tier]}`}
      title={formatMediaItemsCount(count)}
    >
      {count}
    </span>
  );
}

function SeriesTree({
  depth = 0,
  isSearchActive,
  nodes,
}: {
  depth?: number;
  isSearchActive: boolean;
  nodes: FranchiseTreeNode[];
}) {
  const [expandedSeriesIds, setExpandedSeriesIds] = useState<Set<number>>(() => new Set());

  return (
    <div className={depth > 0 ? "ml-5" : undefined}>
    {nodes.map((series, seriesIndex) => {
    const countTier = getSeriesCountTier(series.mediaItemsCount);
    const canCollapse = !isSearchActive && series.children.length > COLLAPSED_CHILDREN_COUNT;
    const isExpanded = expandedSeriesIds.has(series.id);
    const visibleChildren = canCollapse && !isExpanded
      ? series.children.slice(0, COLLAPSED_CHILDREN_COUNT)
      : series.children;
    const hiddenChildrenCount = series.children.length - COLLAPSED_CHILDREN_COUNT;

    return (
      <div
        key={series.id}
        className={depth > 0 ? "relative pl-4" : ""}
      >
        {depth > 0 ? (
          <>
            <span
              aria-hidden="true"
              className={`absolute left-0 top-0 border-l border-stone-400/70 ${seriesIndex === nodes.length - 1 ? "h-[1.2rem]" : "bottom-0"}`}
            />
            <span aria-hidden="true" className="absolute left-0 top-[1.2rem] w-4 border-t border-stone-400/70" />
            <span aria-hidden="true" className="absolute left-[-3px] top-[calc(1.2rem-3px)] size-[7px] rounded-full border border-stone-400 bg-[#eee8da]" />
          </>
        ) : null}
        <Link
          className={`group relative z-[2] flex items-center justify-between gap-4 border-b border-stone-300/45 px-2.5 py-2 transition-colors ${depth > 0 ? "bg-amber-50/40 hover:bg-amber-100/55" : "hover:bg-stone-50/60"}`}
          href={`/series/${series.code}`}
          style={depth > 1 ? { marginLeft: `${Math.min(depth - 1, 4) * 0.5}rem` } : undefined}
        >
          <span className="min-w-0">
            <span className={`${TITLE_STYLES[countTier]} block break-words font-serif leading-tight text-stone-950 group-hover:underline group-hover:decoration-stone-400 group-hover:underline-offset-4`}>
              {series.title}
            </span>
            {series.originalTitle && series.originalTitle !== series.title ? (
              <span className="mt-0.5 block break-words font-mono text-[0.6rem] uppercase tracking-[0.08em] text-stone-500">
                {series.originalTitle}
              </span>
            ) : null}
          </span>
          <SeriesCountBadge count={series.mediaItemsCount} />
        </Link>
        {visibleChildren.length > 0 ? (
          <SeriesTree nodes={visibleChildren} depth={depth + 1} isSearchActive={isSearchActive} />
        ) : null}
        {canCollapse ? (
          <button
            className="ml-5 px-2 py-1.5 font-mono text-[0.65rem] font-semibold uppercase tracking-[0.1em] text-red-900 underline decoration-red-900/35 underline-offset-4 transition-colors hover:text-stone-950"
            onClick={() => setExpandedSeriesIds((currentIds) => {
              const nextIds = new Set(currentIds);

              if (isExpanded) nextIds.delete(series.id); else nextIds.add(series.id);

              return nextIds;
            })}
            type="button"
          >
            {isExpanded ? "Свернуть" : `Ещё ${hiddenChildrenCount}`}
          </button>
        ) : null}
      </div>
    );
    })}
    </div>
  );
}

export function SeriesCatalog({
  isSearchActive,
  items,
  selectedLetter,
}: {
  isSearchActive: boolean;
  items: FranchiseTreeNode[];
  selectedLetter?: string;
}) {
  const groupedItems = items.reduce<Map<string, FranchiseTreeNode[]>>((groups, series) => {
    const group = selectedLetter ?? getSeriesAlphabetGroup(series.title);
    const groupItems = groups.get(group) ?? [];

    groups.set(group, [...groupItems, series]);
    return groups;
  }, new Map());

  return (
    <section aria-label="Серии" className="border-t border-stone-300/60 px-4 py-3 sm:px-6 sm:py-4 lg:px-8">
      <div className="columns-1 gap-6 lg:columns-2 lg:[column-rule:1px_solid_rgba(120,113,108,0.38)]">
        {Array.from(groupedItems, ([group, series]) => (
          <section
            aria-labelledby={`series-group-${encodeURIComponent(group)}`}
            className="mb-4 inline-block w-full break-inside-avoid align-top"
            key={group}
          >
            <h2
              className="rounded-sm border-y border-stone-400/35 bg-[linear-gradient(90deg,rgba(190,174,138,0.78),rgba(225,214,186,0.58))] px-2.5 py-1.5 font-serif text-xl font-semibold leading-none text-stone-950 shadow-[inset_0_1px_0_rgba(255,255,255,0.35)]"
              id={`series-group-${encodeURIComponent(group)}`}
            >
              {group}
            </h2>
            <SeriesTree nodes={series} isSearchActive={isSearchActive} />
          </section>
        ))}
      </div>
    </section>
  );
}
