"use client";

import { createContext, useContext, useEffect, useState } from "react";

import type { ToastSettingsValue } from "@/db/queries/toast-settings";

const DEFAULT_TOAST_SETTINGS: ToastSettingsValue = {
  siteDurationSeconds: 5,
  adminDurationSeconds: 5,
};

const ToastSettingsContext = createContext<ToastSettingsValue>(DEFAULT_TOAST_SETTINGS);

export function ToastSettingsProvider({
  children,
}: {
  children: React.ReactNode;
}) {
  const [settings, setSettings] = useState(DEFAULT_TOAST_SETTINGS);

  useEffect(() => {
    const controller = new AbortController();

    void fetch("/api/toast-settings", {
      cache: "no-store",
      credentials: "same-origin",
      signal: controller.signal,
    })
      .then((response) => response.ok ? response.json() as Promise<ToastSettingsValue> : null)
      .then((value) => {
        if (value) setSettings(value);
      })
      .catch(() => {
        // Значения по умолчанию сохраняют работу тостов при временной ошибке API.
      });

    return () => controller.abort();
  }, []);

  return (
    <ToastSettingsContext.Provider value={settings}>
      {children}
    </ToastSettingsContext.Provider>
  );
}

export function useToastSettings() {
  return useContext(ToastSettingsContext);
}
