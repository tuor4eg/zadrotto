"use client";

import { useMemo } from "react";
import type { CSSProperties } from "react";

import type { MediaTypeFilter } from "@/app/media-items-catalog-logic";
import type { MediaType } from "@/lib/media-types";
import { MEDIA_TYPE_LABELS } from "@/lib/media-types";
import { cn } from "@/lib/utils";

type MediaTypeTabsProps = {
  availableMediaTypes: MediaType[];
  mediaTypeCounts: Array<{
    count: number;
    mediaType: MediaType;
  }>;
  selectedMediaType: MediaTypeFilter;
  onChange: (mediaType: MediaTypeFilter) => void;
};

type MediaTypeTabItem = {
  count: number;
  label: string;
  selected: boolean;
  value: MediaTypeFilter;
};

const TAB_PAPER_CLASSES = [
  "bg-[#b8a0a4]",
  "bg-[#d6aba2]",
  "bg-[#d2b691]",
  "bg-[#cbb79e]",
  "bg-[#b7bdac]",
  "bg-[#aec2c6]",
  "bg-[#c5b9b8]",
  "bg-[#aaa3ad]",
];

function MediaTypeTab({
  index,
  isSelected,
  label,
  count,
  onClick,
  paperClassName,
  selectedIndex,
}: {
  count: number;
  index: number;
  isSelected: boolean;
  label: string;
  onClick: () => void;
  paperClassName: string;
  selectedIndex: number;
}) {
  const distanceFromSelected = Math.abs(index - selectedIndex);
  const overlap = index === 0 ? 0 : Math.min(82, 26 + distanceFromSelected * 16);
  const mobileOverlap = index === 0 ? 0 : Math.min(38, 14 + distanceFromSelected * 8);
  const zIndex = isSelected ? 60 : Math.max(1, 34 - distanceFromSelected);

  return (
    <button
      type="button"
      role="tab"
      aria-selected={isSelected}
      onClick={onClick}
      style={{
        "--tab-mobile-overlap": index === 0 ? "0px" : `${-mobileOverlap}px`,
        "--tab-overlap": index === 0 ? "0px" : `${-overlap}px`,
        zIndex,
      } as CSSProperties}
      className={cn(
        "group relative shrink-0 rounded-t-[14px] px-4 text-center font-mono text-[10px] uppercase tracking-[0.1em] shadow-[-8px_0_14px_rgba(68,64,60,0.20),inset_1px_1px_0_rgba(255,255,255,0.46),inset_-1px_0_0_rgba(68,64,60,0.18)] transition-[background-color,color,transform,box-shadow] hover:z-[80] focus-visible:z-[80] ml-[var(--tab-mobile-overlap)] lg:ml-[var(--tab-overlap)] lg:grow lg:rounded-t-[18px] lg:px-6 lg:text-xs lg:tracking-[0.12em]",
        isSelected
          ? "archive-paper-surface h-12 min-w-[116px] pb-3 pt-3 text-stone-950 shadow-[12px_0_22px_rgba(68,64,60,0.32),0_-7px_18px_rgba(68,64,60,0.22)] after:absolute after:inset-x-0 after:-bottom-px after:h-1 after:bg-[rgb(var(--archive-paper-end))] after:content-[''] lg:h-16 lg:min-w-[156px] lg:pb-4 lg:pt-5"
          : cn(
              "h-10 min-w-[104px] pb-2.5 pt-2.5 text-stone-800 hover:text-stone-950 lg:h-12 lg:min-w-[124px] lg:pb-3 lg:pt-3",
              paperClassName,
            ),
      )}
    >
      <span className="relative z-10 inline-flex max-w-full items-baseline justify-center gap-2">
        <span className="truncate">{label}</span>
        <span
          className={cn(
            "shrink-0 text-[0.9em] tabular-nums",
            isSelected ? "text-stone-500" : "text-stone-700/70",
          )}
        >
          {count}
        </span>
      </span>
      {!isSelected ? (
        <span
          role="tooltip"
          className="archive-paper-surface pointer-events-none absolute left-1/2 top-0 z-[90] hidden -translate-x-1/2 -translate-y-[calc(100%+0.45rem)] whitespace-nowrap rounded-sm border border-stone-500 px-3 py-2 text-[11px] font-semibold normal-case tracking-[0.04em] text-stone-950 opacity-0 shadow-[0_9px_18px_rgba(28,25,23,0.22)] transition-opacity duration-75 group-hover:opacity-100 group-focus-visible:opacity-100 before:absolute before:left-1/2 before:top-full before:size-2 before:-translate-x-1/2 before:-translate-y-1/2 before:rotate-45 before:border-b before:border-r before:border-stone-500 before:bg-[rgb(var(--archive-paper-end))] before:content-[''] lg:block"
        >
          {label}
        </span>
      ) : null}
    </button>
  );
}

export function MediaTypeTabs({
  availableMediaTypes,
  mediaTypeCounts,
  selectedMediaType,
  onChange,
}: MediaTypeTabsProps) {
  const countByMediaType = useMemo(
    () => new Map(mediaTypeCounts.map((item) => [item.mediaType, item.count])),
    [mediaTypeCounts],
  );
  const totalCount = useMemo(
    () => mediaTypeCounts.reduce((total, item) => total + item.count, 0),
    [mediaTypeCounts],
  );
  const tabs = useMemo<MediaTypeTabItem[]>(
    () => {
      if (availableMediaTypes.length === 1) {
        const [mediaType] = availableMediaTypes;

        return [
          {
            count: countByMediaType.get(mediaType) ?? totalCount,
            label: MEDIA_TYPE_LABELS[mediaType],
            selected: selectedMediaType === "all" || selectedMediaType === mediaType,
            value: "all",
          },
        ];
      }

      return [
        {
          count: totalCount,
          label: "Все",
          selected: selectedMediaType === "all",
          value: "all",
        },
        ...availableMediaTypes.map((mediaType) => ({
          count: countByMediaType.get(mediaType) ?? 0,
          label: MEDIA_TYPE_LABELS[mediaType],
          selected: selectedMediaType === mediaType,
          value: mediaType,
        })),
      ];
    },
    [availableMediaTypes, countByMediaType, selectedMediaType, totalCount],
  );
  const selectedIndex = Math.max(
    0,
    tabs.findIndex((tab) => tab.selected),
  );

  return (
    <div className="archive-scrollbar relative max-w-full overflow-x-auto overflow-y-hidden rounded-t-[18px] pl-1 pr-1 pt-2 lg:overflow-visible lg:pr-4">
      <div className="relative z-10 flex min-h-16 min-w-0 items-end gap-1.5">
        <div
          role="tablist"
          aria-label="Тип медиа"
          className="flex w-max min-w-0 items-end overflow-visible whitespace-nowrap lg:w-auto lg:flex-1"
        >
          {tabs.map((tab, index) => {
            return (
              <MediaTypeTab
                key={tab.value}
                index={index}
                isSelected={tab.selected}
                label={tab.label}
                count={tab.count}
                paperClassName={TAB_PAPER_CLASSES[index % TAB_PAPER_CLASSES.length]}
                selectedIndex={selectedIndex}
                onClick={() => onChange(tab.value)}
              />
            );
          })}
        </div>
      </div>
    </div>
  );
}
