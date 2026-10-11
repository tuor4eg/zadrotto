"use client";

import { Children, useEffect, useRef, useState, type ReactNode } from "react";

export function HomeCollectionsRow({ children }: { children: ReactNode }) {
  const rowRef = useRef<HTMLDivElement>(null);
  const [capacity, setCapacity] = useState(3);
  const cards = Children.toArray(children);

  useEffect(() => {
    const row = rowRef.current;
    if (!row) return;
    const observer = new ResizeObserver(([entry]) => {
      const width = entry.contentRect.width;
      const cardWidth = Math.max(240, (width - 36) / 4);
      setCapacity(Math.max(1, Math.floor((width + 12) / (cardWidth + 12))));
    });
    observer.observe(row);
    return () => observer.disconnect();
  }, []);

  return <div ref={rowRef} className="flex gap-3 overflow-x-auto pb-1 [scrollbar-width:thin] [scrollbar-color:rgba(168,162,158,.45)_transparent] lg:overflow-hidden">
    {cards.map((card, index) => <div key={index} className={`min-w-0 shrink-0 lg:w-[calc((100%-2.25rem)/4)] lg:min-w-[15rem] ${index >= capacity ? "lg:hidden" : ""}`}>{card}</div>)}
  </div>;
}
