"use client";

import { useAnalyticsConfig } from "./analytics-config-provider";

import { OPEN_ANALYTICS_SETTINGS_EVENT } from "@/lib/analytics/consent";

export function AnalyticsSettingsButton() {
  const { enabled } = useAnalyticsConfig();
  if (!enabled) return null;
  return (
    <span className="border-l border-stone-400/40 px-1.5 sm:px-3">
    <button
      className="hover:text-stone-950"
      type="button"
      onClick={() => window.dispatchEvent(new Event(OPEN_ANALYTICS_SETTINGS_EVENT))}
    >
      COOKIES
    </button>
    </span>
  );
}
