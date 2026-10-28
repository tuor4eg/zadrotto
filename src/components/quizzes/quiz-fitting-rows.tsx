"use client";

import { useLayoutEffect, useRef, type ReactNode } from "react";

export function QuizFittingRows({ children, enabled }: { children: ReactNode; enabled: boolean }) {
  const ref = useRef<HTMLDivElement>(null);

  useLayoutEffect(() => {
    const container = ref.current;
    if (!container || !enabled) return;
    const desktop = window.matchMedia("(min-width: 1024px)");
    let frame = 0;
    let disposed = false;

    function fit() {
      if (!container) return;
      const rows = Array.from(container.querySelectorAll<HTMLElement>("[data-quiz-row]"));
      rows.forEach((row) => { row.hidden = false; });
      const bottom = container.getBoundingClientRect().bottom;
      const visible = rows.map((row, index) => desktop.matches
        ? row.getBoundingClientRect().bottom <= bottom + 0.5
        : index < 5);
      rows.forEach((row, index) => { row.hidden = !visible[index]; });
    }

    function schedule() {
      cancelAnimationFrame(frame);
      frame = requestAnimationFrame(fit);
    }

    fit();
    const observer = new ResizeObserver(schedule);
    observer.observe(container);
    desktop.addEventListener("change", schedule);
    document.fonts.ready.then(() => { if (!disposed) schedule(); });
    return () => {
      disposed = true;
      cancelAnimationFrame(frame);
      observer.disconnect();
      desktop.removeEventListener("change", schedule);
    };
  }, [enabled, children]);

  return <div ref={ref} className={enabled ? "min-h-0 overflow-hidden lg:flex-1" : undefined}>{children}</div>;
}
