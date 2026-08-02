"use client";

import { useEffect, useRef } from "react";

export function ViewedAt({ value }: { value: string }) {
  const timeRef = useRef<HTMLTimeElement>(null);

  useEffect(() => {
    if (!timeRef.current) return;
    timeRef.current.textContent = new Intl.DateTimeFormat("ru-RU", {
      dateStyle: "medium",
      timeStyle: "short",
    }).format(new Date(value));
  }, [value]);

  return <time ref={timeRef} dateTime={value}>…</time>;
}
