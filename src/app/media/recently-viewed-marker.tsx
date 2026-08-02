"use client";

import { useEffect } from "react";

export function RecentlyViewedMarker({ code }: { code: string }) {
  useEffect(() => {
    void fetch("/api/recently-viewed", {
      body: JSON.stringify({ code }),
      headers: { "content-type": "application/json" },
      keepalive: true,
      method: "POST",
    }).catch(() => undefined);
  }, [code]);

  return null;
}
