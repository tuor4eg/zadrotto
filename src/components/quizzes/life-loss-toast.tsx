"use client";

import { useEffect, useRef, type CSSProperties } from "react";
import { Heart } from "lucide-react";

export function LifeLossToast({ style }: { style?: CSSProperties }) {
  const ref = useRef<HTMLSpanElement>(null);
  useEffect(() => {
    const reducedMotion = window.matchMedia("(prefers-reduced-motion: reduce)").matches;
    const animation = ref.current?.animate([
      { opacity: 1, transform: "translate(-50%, 0)" },
      { opacity: 1, offset: 0.45 },
      { opacity: 0, transform: `translate(-50%, ${reducedMotion ? "0" : "-48px"})` },
    ], { duration: 1_000, easing: "ease-out", fill: "forwards" });
    return () => animation?.cancel();
  }, []);

  return <span ref={ref} role="status" aria-label="Минус одна жизнь"
    style={{ left: "50%", top: "-8px", transform: "translate(-50%, 0)", ...style }}
    className="pointer-events-none absolute z-20 flex items-center gap-1 whitespace-nowrap text-sm font-semibold text-red-800 drop-shadow-[0_1px_2px_rgba(255,255,255,0.9)]">
    −1 <Heart aria-hidden="true" className="size-4 fill-red-700" />
  </span>;
}

