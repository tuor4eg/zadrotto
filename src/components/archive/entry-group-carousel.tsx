"use client";

import { useEffect, useRef, useState, type KeyboardEvent, type ReactNode } from "react";
import { CarouselArrowButton } from "@/components/archive/carousel-arrow-button";

export function EntryGroupCarousel({ label, children }: { label: string; children: ReactNode }) {
  const viewportRef = useRef<HTMLDivElement>(null);
  const [navigation, setNavigation] = useState({ previous: false, next: false });

  useEffect(() => {
    const viewport = viewportRef.current;
    if (!viewport) return;
    function updateNavigation() {
      if (!viewport) return;
      const previous = viewport.scrollLeft > 1;
      const next = viewport.scrollLeft + viewport.clientWidth < viewport.scrollWidth - 1;
      setNavigation((current) => current.previous === previous && current.next === next ? current : { previous, next });
    }
    const observer = new ResizeObserver(updateNavigation);
    observer.observe(viewport);
    for (const child of viewport.children) observer.observe(child);
    viewport.addEventListener("scroll", updateNavigation, { passive: true });
    updateNavigation();
    return () => {
      observer.disconnect();
      viewport.removeEventListener("scroll", updateNavigation);
    };
  }, [children]);

  function movePage(direction: number) {
    const viewport = viewportRef.current;
    if (!viewport) return;
    const first = viewport.children[0] as HTMLElement | undefined;
    const second = viewport.children[1] as HTMLElement | undefined;
    const step = first && second ? second.offsetLeft - first.offsetLeft : viewport.clientWidth;
    const page = step > 0 ? Math.max(1, Math.floor(viewport.clientWidth / step)) * step : viewport.clientWidth;
    viewport.scrollBy({
      left: page * direction,
      behavior: window.matchMedia("(prefers-reduced-motion: reduce)").matches ? "auto" : "smooth",
    });
  }

  function handleKeyDown(event: KeyboardEvent<HTMLDivElement>) {
    if (event.target !== event.currentTarget) return;
    const element = event.currentTarget;
    if (event.key === "ArrowRight" || event.key === "ArrowLeft") {
      event.preventDefault();
      element.scrollBy({ left: element.clientWidth * (event.key === "ArrowRight" ? 1 : -1), behavior: "auto" });
    } else if (event.key === "Home" || event.key === "End") {
      event.preventDefault();
      element.scrollTo({ left: event.key === "Home" ? 0 : element.scrollWidth, behavior: "auto" });
    }
  }

  return <div className="relative min-w-0">
    {navigation.previous || navigation.next ? <div className="pointer-events-none absolute inset-x-2 top-[6.75rem] z-10 hidden -translate-y-1/2 justify-between lg:flex">
      <CarouselArrowButton direction="previous" size="default" className="pointer-events-auto disabled:invisible" aria-label={`Предыдущие записи: ${label}`} disabled={!navigation.previous} onClick={() => movePage(-1)} />
      <CarouselArrowButton direction="next" size="default" className="pointer-events-auto disabled:invisible" aria-label={`Следующие записи: ${label}`} disabled={!navigation.next} onClick={() => movePage(1)} />
    </div> : null}
    <div
    ref={viewportRef}
    aria-label={label}
    role="region"
    tabIndex={0}
    onKeyDown={handleKeyDown}
    className="relative flex min-w-0 max-w-full snap-x snap-mandatory gap-6 overflow-x-auto overscroll-x-contain pb-4 [scrollbar-width:none] [&::-webkit-scrollbar]:hidden focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-stone-600 lg:pb-0"
  >{children}</div>
  </div>;
}
