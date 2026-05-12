"use client";

import { useRef } from "react";
import { ChevronLeft, ChevronRight } from "lucide-react";

import type { MediaTypeFilter } from "@/app/media-items-catalog-logic";
import type { MediaType } from "@/lib/media-types";
import { MEDIA_TYPE_LABELS } from "@/lib/media-types";
import { cn } from "@/lib/utils";

type MediaTypeTabsProps = {
  availableMediaTypes: MediaType[];
  mediaTypeCounts: Map<MediaType, number>;
  selectedMediaType: MediaTypeFilter;
  onChange: (mediaType: MediaTypeFilter) => void;
};

function MediaTypeTab({
  children,
  isSelected,
  onClick,
}: {
  children: React.ReactNode;
  isSelected: boolean;
  onClick: () => void;
}) {
  return (
    <button
      type="button"
      role="tab"
      aria-selected={isSelected}
      onClick={onClick}
      className={cn(
        "shrink-0 rounded-t-md border px-4 py-2 font-mono text-xs uppercase tracking-[0.12em] transition-colors",
        isSelected
          ? "translate-y-px border-stone-500 border-b-transparent bg-stone-50 text-stone-950 shadow-[0_-1px_0_rgba(255,255,255,0.75)_inset]"
          : "border-stone-300/80 bg-stone-100/80 text-stone-600 shadow-[0_2px_0_rgba(68,64,60,0.10)] hover:border-stone-700 hover:text-stone-950",
      )}
    >
      {children}
    </button>
  );
}

function MediaTypeTabsScrollButton({
  direction,
  onClick,
}: {
  direction: "left" | "right";
  onClick: () => void;
}) {
  const Icon = direction === "left" ? ChevronLeft : ChevronRight;

  return (
    <button
      type="button"
      onClick={onClick}
      className="mb-1 grid size-9 shrink-0 place-items-center rounded-t-md border border-stone-300/80 bg-stone-100/85 text-stone-700 shadow-[0_2px_0_rgba(68,64,60,0.12)] transition-colors hover:border-stone-700 hover:text-stone-950"
      aria-label={`Прокрутить типы медиа ${direction === "left" ? "влево" : "вправо"}`}
    >
      <Icon className="size-4" />
    </button>
  );
}

export function MediaTypeTabs({
  availableMediaTypes,
  mediaTypeCounts,
  selectedMediaType,
  onChange,
}: MediaTypeTabsProps) {
  const tabsRef = useRef<HTMLDivElement>(null);

  function scrollTabs(direction: -1 | 1) {
    const tabs = tabsRef.current;

    if (!tabs) {
      return;
    }

    tabs.scrollBy({
      left: direction * Math.max(180, tabs.clientWidth * 0.72),
      behavior: "smooth",
    });
  }

  return (
    <div className="mt-3 overflow-hidden rounded-t-md border-b border-stone-400/70 bg-stone-200/20 px-1 pt-2">
      <div className="flex min-w-0 items-end gap-1">
        <MediaTypeTabsScrollButton direction="left" onClick={() => scrollTabs(-1)} />

        <div
          ref={tabsRef}
          role="tablist"
          aria-label="Тип медиа"
          className="flex min-w-0 flex-1 items-end gap-1 overflow-x-auto overflow-y-hidden scroll-smooth whitespace-nowrap [scrollbar-width:none] [&::-webkit-scrollbar]:hidden"
        >
          <MediaTypeTab
            isSelected={selectedMediaType === "all"}
            onClick={() => onChange("all")}
          >
            Все
          </MediaTypeTab>

          {availableMediaTypes.map((mediaType) => {
            const isSelected = selectedMediaType === mediaType;

            return (
              <MediaTypeTab
                key={mediaType}
                isSelected={isSelected}
                onClick={() => onChange(mediaType)}
              >
                {MEDIA_TYPE_LABELS[mediaType]}
                <span className={isSelected ? "ml-2 text-stone-500" : "ml-2 text-stone-400"}>
                  {mediaTypeCounts.get(mediaType)}
                </span>
              </MediaTypeTab>
            );
          })}
        </div>

        <MediaTypeTabsScrollButton direction="right" onClick={() => scrollTabs(1)} />
      </div>
    </div>
  );
}
