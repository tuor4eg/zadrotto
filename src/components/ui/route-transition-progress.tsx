"use client";

import { usePathname, useSearchParams } from "next/navigation";
import { useEffect, useRef, useState } from "react";
import { flushSync } from "react-dom";

const ROUTE_PROGRESS_TIMEOUT_MS = 15_000;

function isNavigatingAnchor(anchor: HTMLAnchorElement, event: MouseEvent) {
  if (
    event.button !== 0 ||
    event.metaKey ||
    event.ctrlKey ||
    event.shiftKey ||
    event.altKey ||
    anchor.target === "_blank" ||
    anchor.hasAttribute("download")
  ) {
    return false;
  }

  const destination = new URL(anchor.href, window.location.href);
  const current = new URL(window.location.href);

  return (
    destination.origin === current.origin &&
    `${destination.pathname}${destination.search}` !== `${current.pathname}${current.search}`
  );
}

export function RouteTransitionProgress() {
  const pathname = usePathname();
  const searchParams = useSearchParams();
  const routeKey = `${pathname}?${searchParams.toString()}`;
  const [isVisible, setIsVisible] = useState(false);
  const timeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  useEffect(() => {
    const frameId = requestAnimationFrame(() => {
      setIsVisible(false);
      if (timeoutRef.current) clearTimeout(timeoutRef.current);
    });

    return () => cancelAnimationFrame(frameId);
  }, [routeKey]);

  useEffect(() => {
    function startProgress() {
      flushSync(() => setIsVisible(true));
      if (timeoutRef.current) clearTimeout(timeoutRef.current);
      timeoutRef.current = setTimeout(() => setIsVisible(false), ROUTE_PROGRESS_TIMEOUT_MS);
    }

    function handleClick(event: MouseEvent) {
      const target = event.target;
      const anchor = target instanceof Element ? target.closest("a[href]") : null;

      if (anchor instanceof HTMLAnchorElement && isNavigatingAnchor(anchor, event)) {
        startProgress();
      }
    }

    function handlePopState() {
      startProgress();
    }

    document.addEventListener("click", handleClick, { capture: true });
    window.addEventListener("popstate", handlePopState);

    return () => {
      document.removeEventListener("click", handleClick, { capture: true });
      window.removeEventListener("popstate", handlePopState);
      if (timeoutRef.current) clearTimeout(timeoutRef.current);
    };
  }, []);

  return isVisible ? (
    <div
      className="route-loading-overlay pointer-events-none fixed inset-x-0 top-0 z-[200] h-1 overflow-hidden bg-stone-950/10"
      role="status"
      aria-live="polite"
      aria-label="Загружаем страницу"
    >
      <div className="route-loading-progress h-full w-2/5 bg-[#b89a68] shadow-[0_0_10px_rgba(120,89,48,0.45)]" />
    </div>
  ) : null;
}
