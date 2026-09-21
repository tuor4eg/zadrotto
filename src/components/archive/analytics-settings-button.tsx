"use client";

import { OPEN_ANALYTICS_SETTINGS_EVENT } from "@/lib/analytics/consent";

export function AnalyticsSettingsButton() {
  return (
    <button
      className="hover:text-stone-950"
      type="button"
      onClick={() => window.dispatchEvent(new Event(OPEN_ANALYTICS_SETTINGS_EVENT))}
    >
      COOKIES
    </button>
  );
}
