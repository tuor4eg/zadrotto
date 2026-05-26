"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { usePathname, useSearchParams } from "next/navigation";

const LOADER_TIMEOUT_MS = 15_000;

function isModifiedClick(event: MouseEvent) {
  return event.metaKey || event.ctrlKey || event.shiftKey || event.altKey || event.button !== 0;
}

function shouldShowForLink(link: HTMLAnchorElement) {
  if (link.target && link.target !== "_self") {
    return false;
  }

  if (link.hasAttribute("download")) {
    return false;
  }

  const nextUrl = new URL(link.href, window.location.href);

  if (nextUrl.origin !== window.location.origin) {
    return false;
  }

  if (nextUrl.href === window.location.href) {
    return false;
  }

  return true;
}

export function AdminProgressBar() {
  const pathname = usePathname();
  const searchParams = useSearchParams();
  const search = searchParams.toString();
  const [isLoading, setIsLoading] = useState(false);
  const timeoutRef = useRef<number | null>(null);

  const stopLoading = useCallback(() => {
    if (timeoutRef.current !== null) {
      window.clearTimeout(timeoutRef.current);
      timeoutRef.current = null;
    }

    setIsLoading(false);
  }, []);

  const startLoading = useCallback(() => {
    if (timeoutRef.current !== null) {
      window.clearTimeout(timeoutRef.current);
    }

    setIsLoading(true);
    timeoutRef.current = window.setTimeout(stopLoading, LOADER_TIMEOUT_MS);
  }, [stopLoading]);

  useEffect(() => {
    stopLoading();
  }, [pathname, search, stopLoading]);

  useEffect(() => {
    function handleClick(event: MouseEvent) {
      if (event.defaultPrevented || isModifiedClick(event)) {
        return;
      }

      const target = event.target instanceof Element ? event.target : null;
      const link = target?.closest<HTMLAnchorElement>("a[href]");

      if (link && shouldShowForLink(link)) {
        startLoading();
      }
    }

    function handleSubmit(event: SubmitEvent) {
      if (!event.defaultPrevented) {
        startLoading();
      }
    }

    document.addEventListener("click", handleClick, true);
    document.addEventListener("submit", handleSubmit, true);
    window.addEventListener("pageshow", stopLoading);

    return () => {
      document.removeEventListener("click", handleClick, true);
      document.removeEventListener("submit", handleSubmit, true);
      window.removeEventListener("pageshow", stopLoading);
      stopLoading();
    };
  }, [startLoading, stopLoading]);

  if (!isLoading) {
    return null;
  }

  return (
    <div
      role="status"
      aria-label="Загрузка"
      className="fixed inset-x-0 top-0 z-[100] h-1 overflow-hidden bg-stone-200/80"
    >
      <div className="admin-progress-fill h-full w-full bg-stone-500 shadow-[0_0_16px_rgba(120,113,108,0.42)]" />
    </div>
  );
}
