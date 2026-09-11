"use client";

import Link from "next/link";
import { useLayoutEffect, useRef, useState } from "react";

type ArchiveChildSeriesItem = {
  id: number;
  href: string;
  title: string;
};

const TAG_GAP_PX = 6;
const tagClassName = "inline-block max-w-full shrink-0 rounded-full bg-[var(--archive-bg-end)] px-2.5 py-1 text-xs font-medium lowercase leading-5 text-stone-100 transition-colors [overflow-wrap:anywhere] hover:bg-[var(--archive-bg-start)] hover:text-white";

export function ArchiveChildSeries({ items }: { items: ArchiveChildSeriesItem[] }) {
  const containerRef = useRef<HTMLDivElement>(null);
  const measurementRef = useRef<HTMLDivElement>(null);
  const [expanded, setExpanded] = useState(false);
  const [visibleCount, setVisibleCount] = useState(0);

  useLayoutEffect(() => {
    const container = containerRef.current;
    const measurement = measurementRef.current;
    if (!container || !measurement) return;

    const measure = () => {
      const more = measurement.querySelector<HTMLElement>("[data-child-series-more]");
      const tags = Array.from(
        measurement.querySelectorAll<HTMLElement>("[data-child-series-tag]"),
      );
      if (!more) return;

      const availableWidth = container.clientWidth;
      let usedWidth = 0;
      let nextVisibleCount = 0;

      for (const tag of tags) {
        const nextWidth = usedWidth + TAG_GAP_PX + tag.offsetWidth;
        const remainingCount = items.length - nextVisibleCount - 1;
        const reservedMoreWidth = remainingCount > 0 ? TAG_GAP_PX + more.offsetWidth : 0;

        if (nextWidth + reservedMoreWidth > availableWidth) break;
        usedWidth = nextWidth;
        nextVisibleCount += 1;
      }

      setVisibleCount(nextVisibleCount);
    };

    measure();
    const observer = new ResizeObserver(measure);
    observer.observe(container);
    return () => observer.disconnect();
  }, [items]);

  const visibleItems = expanded ? items : items.slice(0, visibleCount);
  const hiddenCount = items.length - visibleCount;

  return (
    <div className="relative min-w-0 flex-1 self-baseline" ref={containerRef}>
      <div className="flex min-w-0 flex-wrap items-center gap-1.5">
        {visibleItems.map((child) => (
          <Link className={tagClassName} href={child.href} key={child.id}>
            {child.title}
          </Link>
        ))}
        {!expanded && hiddenCount > 0 ? (
          <button
            className="shrink-0 font-mono text-[10px] font-semibold uppercase tracking-[0.08em] text-red-900 underline decoration-red-900/40 underline-offset-4 hover:text-stone-950"
            onClick={() => setExpanded(true)}
            type="button"
          >
            + ещё {hiddenCount}
          </button>
        ) : null}
        {expanded ? (
          <button
            className="shrink-0 font-mono text-[10px] font-semibold uppercase tracking-[0.08em] text-red-900 underline decoration-red-900/40 underline-offset-4 hover:text-stone-950"
            onClick={() => setExpanded(false)}
            type="button"
          >
            Свернуть
          </button>
        ) : null}
      </div>

      <div className="pointer-events-none invisible absolute left-0 top-0 flex w-max items-center gap-1.5" ref={measurementRef} aria-hidden="true">
        {items.map((child) => (
          <span className={tagClassName} data-child-series-tag key={child.id}>{child.title}</span>
        ))}
        <span className="font-mono text-[10px] font-semibold uppercase tracking-[0.08em]" data-child-series-more>
          + ещё {items.length}
        </span>
      </div>
    </div>
  );
}
