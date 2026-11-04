"use client";

import { createContext, useContext, useEffect, useRef, useState, type ReactNode } from "react";
import { usePathname } from "next/navigation";

type AnalyticsConfig = { enabled: boolean; measurementId: string | null; isReady: boolean };
const AnalyticsConfigContext = createContext<AnalyticsConfig>({ enabled: false, measurementId: null, isReady: false });

export function useAnalyticsConfig() {
  return useContext(AnalyticsConfigContext);
}

export function AnalyticsConfigProvider({ children }: { children: ReactNode }) {
  const pathname = usePathname();
  const [config, setConfig] = useState<AnalyticsConfig>({ enabled: false, measurementId: null, isReady: false });
  const previousId = useRef<string | null>(null);
  useEffect(() => {
    let active = true;
    let generation = 0;
    async function refresh() {
      const requestGeneration = ++generation;
      let next: AnalyticsConfig = { enabled: false, measurementId: null, isReady: true };
      try {
        const response = await fetch("/api/analytics-config", { cache: "no-store" });
        const value = response.ok ? await response.json() as { enabled?: unknown; measurementId?: unknown } : null;
        next = { enabled: value?.enabled === true, measurementId: value?.enabled === true && typeof value.measurementId === "string" ? value.measurementId : null, isReady: true };
      } catch {
        // Configuration failures never enable analytics.
      }
      if (!active || requestGeneration !== generation) return;
      if (previousId.current && previousId.current !== next.measurementId) {
        // Unmounting next/script does not unload GA. Stop collection and reload to remove it.
        (window as unknown as Record<string, unknown>)[`ga-disable-${previousId.current}`] = true;
        window.location.reload();
      }
      previousId.current = next.measurementId;
      setConfig(next);
    }
    void refresh();
    window.addEventListener("focus", refresh);
    const timer = window.setInterval(() => void refresh(), 60_000);
    return () => { active = false; window.removeEventListener("focus", refresh); window.clearInterval(timer); };
  }, [pathname]);
  return <AnalyticsConfigContext.Provider value={config}>{children}</AnalyticsConfigContext.Provider>;
}
