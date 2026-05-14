"use client";

import { useMemo } from "react";

import type { MediaTypeFilter } from "@/app/media-items-catalog-logic";
import type { MediaType } from "@/lib/media-types";
import { MEDIA_TYPE_LABELS } from "@/lib/media-types";
import { cn } from "@/lib/utils";

type MediaTypeTabsProps = {
  availableMediaTypes: MediaType[];
  selectedMediaType: MediaTypeFilter;
  onChange: (mediaType: MediaTypeFilter) => void;
};

type MediaTypeTabItem = {
  label: string;
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
  onClick,
  paperClassName,
  selectedIndex,
}: {
  index: number;
  isSelected: boolean;
  label: string;
  onClick: () => void;
  paperClassName: string;
  selectedIndex: number;
}) {
  const distanceFromSelected = Math.abs(index - selectedIndex);
  const overlap = index === 0 ? 0 : Math.min(82, 26 + distanceFromSelected * 16);
  const zIndex = isSelected ? 60 : Math.max(1, 34 - distanceFromSelected);

  return (
    <button
      type="button"
      role="tab"
      aria-selected={isSelected}
      onClick={onClick}
      style={{
        marginLeft: index === 0 ? undefined : `${-overlap}px`,
        zIndex,
      }}
      className={cn(
        "group relative grow shrink-0 rounded-t-[18px] px-6 text-center font-mono text-xs uppercase tracking-[0.12em] shadow-[-8px_0_14px_rgba(68,64,60,0.20),inset_1px_1px_0_rgba(255,255,255,0.46),inset_-1px_0_0_rgba(68,64,60,0.18)] transition-[background-color,color,transform,box-shadow] hover:z-[80] focus-visible:z-[80]",
        isSelected
          ? "archive-paper-surface h-16 min-w-[156px] pb-4 pt-5 text-stone-950 shadow-[12px_0_22px_rgba(68,64,60,0.32),0_-7px_18px_rgba(68,64,60,0.22)] after:absolute after:inset-x-0 after:-bottom-px after:h-1 after:bg-[rgb(var(--archive-paper-end))] after:content-['']"
          : cn(
              "h-12 min-w-[124px] pb-3 pt-3 text-stone-800 hover:text-stone-950",
              paperClassName,
            ),
      )}
    >
      <span className="relative z-10 inline-flex max-w-full items-baseline justify-center gap-2">
        <span className="truncate">{label}</span>
      </span>
      {!isSelected ? (
        <span
          role="tooltip"
          className="archive-paper-surface pointer-events-none absolute left-1/2 top-0 z-[90] -translate-x-1/2 -translate-y-[calc(100%+0.45rem)] whitespace-nowrap rounded-sm border border-stone-500 px-3 py-2 text-[11px] font-semibold normal-case tracking-[0.04em] text-stone-950 opacity-0 shadow-[0_9px_18px_rgba(28,25,23,0.22)] transition-opacity duration-75 group-hover:opacity-100 group-focus-visible:opacity-100 before:absolute before:left-1/2 before:top-full before:size-2 before:-translate-x-1/2 before:-translate-y-1/2 before:rotate-45 before:border-b before:border-r before:border-stone-500 before:bg-[rgb(var(--archive-paper-end))] before:content-['']"
        >
          {label}
        </span>
      ) : null}
    </button>
  );
}

export function MediaTypeTabs({
  availableMediaTypes,
  selectedMediaType,
  onChange,
}: MediaTypeTabsProps) {
  const tabs = useMemo<MediaTypeTabItem[]>(
    () => [
      {
        label: "Все",
        value: "all",
      },
      ...availableMediaTypes.map((mediaType) => ({
        label: MEDIA_TYPE_LABELS[mediaType],
        value: mediaType,
      })),
    ],
    [availableMediaTypes],
  );
  const selectedIndex = Math.max(
    0,
    tabs.findIndex((tab) => tab.value === selectedMediaType),
  );

  return (
    <div className="relative overflow-visible rounded-t-[18px] pl-1 pr-4 pt-2">
      <div className="relative z-10 flex min-h-16 min-w-0 items-end gap-1.5">
        <div
          role="tablist"
          aria-label="Тип медиа"
          className="flex min-w-0 flex-1 items-end overflow-visible whitespace-nowrap"
        >
          {tabs.map((tab, index) => {
            const isSelected = selectedMediaType === tab.value;

            return (
              <MediaTypeTab
                key={tab.value}
                index={index}
                isSelected={isSelected}
                label={tab.label}
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
