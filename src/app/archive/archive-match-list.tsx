"use client";

import { useLayoutEffect, useRef, type ReactNode } from "react";

export function ArchiveMatchList({ children }: { children: ReactNode }) {
  const listRef = useRef<HTMLUListElement>(null);

  useLayoutEffect(() => {
    const list = listRef.current;
    if (!list) return;
    const items = Array.from(list.children);

    function fitItems() {
      if (!list) return;
      const right = list.getBoundingClientRect().right;
      for (const item of items) {
        item.toggleAttribute("inert", item.getBoundingClientRect().right > right);
      }
    }

    fitItems();
    const observer = new ResizeObserver(fitItems);
    observer.observe(list);
    for (const item of items) observer.observe(item);

    return () => observer.disconnect();
  }, [children]);

  return (
    <ul
      ref={listRef}
      className="flex min-w-0 flex-1 items-center gap-x-5 overflow-hidden whitespace-nowrap max-sm:order-last max-sm:basis-full [&>li]:shrink-0 [&>li[inert]]:invisible"
    >
      {children}
    </ul>
  );
}
