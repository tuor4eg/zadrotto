"use client";

import { useMemo } from "react";
import type { CSSProperties } from "react";

import type { MediaTypeFilter } from "@/app/media-items-catalog-logic";
import { getMediaTypeLabel, type MediaType, type MediaTypeOption } from "@/lib/media/types";
import { cn } from "@/lib/common/utils";

type MediaTypeTabsProps = {
  availableMediaTypes: MediaType[];
  mediaTypeCounts: Array<{
    count: number;
    mediaType: MediaType;
  }>;
  mediaTypes: MediaTypeOption[];
  selectedMediaType: MediaTypeFilter;
  onChange: (mediaType: MediaTypeFilter) => void;
};

type MediaTypeTabItem = {
  count: number;
  label: string;
  selected: boolean;
  value: MediaTypeFilter;
};

function MediaTypeTab({
  index,
  isSelected,
  label,
  count,
  onClick,
  selectedIndex,
}: {
  count: number;
  index: number;
  isSelected: boolean;
  label: string;
  onClick: () => void;
  selectedIndex: number;
}) {
  const distanceFromSelected = Math.abs(index - selectedIndex);
  const zIndex = isSelected ? 60 : Math.max(1, 34 - distanceFromSelected);

  return (
    <button
      type="button"
      role="tab"
      aria-selected={isSelected}
      onClick={onClick}
      style={{
        zIndex,
      } as CSSProperties}
      className={cn(
        "archive-media-type-tab group relative inline-flex shrink-0 items-end justify-center px-3 text-center font-mono text-[10px] uppercase tracking-[0.1em] transition-[color,transform,filter] hover:z-[80] focus-visible:z-[80] ml-0 lg:w-auto lg:min-w-[var(--archive-media-type-tab-width)] lg:flex-1 lg:basis-[var(--archive-media-type-tab-width)] lg:px-3 lg:text-xs lg:tracking-[0.12em]",
        isSelected
          ? "archive-media-type-tab-active h-10 min-w-[116px] pb-2.5 pt-2.5 text-stone-950 lg:h-12 lg:min-w-0 lg:pb-3 lg:pt-3"
          : "archive-media-type-tab-inactive h-10 min-w-[104px] pb-2.5 pt-2.5 text-stone-800 hover:text-stone-950 lg:h-12 lg:min-w-0 lg:pb-3 lg:pt-3",
        index > 0 && "lg:-ml-4",
        !isSelected && index < selectedIndex && "archive-media-type-tab-before-active",
      )}
    >
      {isSelected ? (
        <span aria-hidden="true" className="archive-media-type-tab-active-shadow">
          <span />
        </span>
      ) : null}
      <span className="relative z-10 inline-flex max-w-full items-baseline justify-center gap-1.5">
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
    </button>
  );
}

export function MediaTypeTabs({
  availableMediaTypes,
  mediaTypeCounts,
  mediaTypes,
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
    () => [
      {
        count: totalCount,
        label: "Все",
        selected: selectedMediaType === "all",
        value: "all",
      },
      ...availableMediaTypes.map((mediaType) => ({
        count: countByMediaType.get(mediaType) ?? 0,
        label: getMediaTypeLabel(mediaType, mediaTypes),
        selected: selectedMediaType === mediaType,
        value: mediaType,
      })),
    ],
    [availableMediaTypes, countByMediaType, mediaTypes, selectedMediaType, totalCount],
  );
  const selectedIndex = Math.max(
    0,
    tabs.findIndex((tab) => tab.selected),
  );
  const longestTabValueLength = Math.max(
    ...tabs.map((tab) => [tab.label, tab.count].join(" ").length),
  );
  const tabListStyle = {
    "--archive-media-type-tab-width":
      "calc(" +
      longestTabValueLength +
      "ch + " +
      longestTabValueLength * 0.12 +
      "em + 2.5rem)",
  } as CSSProperties;

  return (
    <div className="archive-scrollbar archive-tabs-scrollbar relative max-w-full overflow-x-auto overflow-y-hidden rounded-t-[18px] px-0 [scrollbar-gutter:auto] lg:overflow-visible">
      <div className="relative z-10 flex min-h-10 min-w-0 items-end gap-1.5 lg:min-h-12">
        <div
          role="tablist"
          aria-label="Тип медиа"
          style={tabListStyle}
          className="flex w-max min-w-0 items-end overflow-visible whitespace-nowrap lg:w-full"
        >
          {tabs.map((tab, index) => {
            return (
              <MediaTypeTab
                key={tab.value}
                index={index}
                isSelected={tab.selected}
                label={tab.label}
                count={tab.count}
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
