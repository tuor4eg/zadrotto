"use client";

import { useLayoutEffect, useRef, useState } from "react";

const LINE_HEIGHT_PX = 24;

export function AdaptiveReviewExcerpt({ text }: { text: string }) {
  const containerRef = useRef<HTMLDivElement>(null);
  const [lineCount, setLineCount] = useState(1);

  useLayoutEffect(() => {
    const container = containerRef.current;
    if (!container) return;

    const updateLineCount = () => {
      setLineCount(Math.max(1, Math.floor(container.clientHeight / LINE_HEIGHT_PX)));
    };
    updateLineCount();
    const observer = new ResizeObserver(updateLineCount);
    observer.observe(container);
    return () => observer.disconnect();
  }, []);

  return <div ref={containerRef} className="mt-3 min-h-0 flex-1 overflow-hidden">
    <blockquote
      className="overflow-hidden font-serif text-base italic leading-6 text-stone-800"
      style={{ display: "-webkit-box", WebkitBoxOrient: "vertical", WebkitLineClamp: lineCount }}
    >
      «{text}»
    </blockquote>
  </div>;
}
