"use client";

import {
  createContext,
  useContext,
  useLayoutEffect,
  useMemo,
  useState,
  type ReactNode,
} from "react";

type PageAvailabilityValue = {
  pageUnavailable: boolean;
  setPageUnavailable: (unavailable: boolean) => void;
};

const PageAvailabilityContext = createContext<PageAvailabilityValue | null>(null);

export function PageAvailabilityProvider({ children }: { children: ReactNode }) {
  const [pageUnavailable, setPageUnavailable] = useState(false);
  const value = useMemo(
    () => ({ pageUnavailable, setPageUnavailable }),
    [pageUnavailable],
  );

  return (
    <PageAvailabilityContext.Provider value={value}>
      {children}
    </PageAvailabilityContext.Provider>
  );
}

export function usePageUnavailable() {
  return useContext(PageAvailabilityContext)?.pageUnavailable ?? false;
}

export function useReportPageUnavailable() {
  const context = useContext(PageAvailabilityContext);
  const setPageUnavailable = context?.setPageUnavailable;

  useLayoutEffect(() => {
    if (!setPageUnavailable) return;
    setPageUnavailable(true);
    return () => setPageUnavailable(false);
  }, [setPageUnavailable]);
}
