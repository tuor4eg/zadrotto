"use client";

import { GoogleAnalytics } from "@next/third-parties/google";
import { X } from "lucide-react";
import Link from "next/link";
import { useEffect, useState } from "react";

import { Button } from "@/components/ui/button";
import {
  ANALYTICS_CONSENT_STORAGE_KEY,
  OPEN_ANALYTICS_SETTINGS_EVENT,
} from "@/lib/analytics/consent";

type AnalyticsConsent = "denied" | "granted";

function clearGoogleAnalyticsCookies() {
  const hostname = window.location.hostname;

  for (const cookie of document.cookie.split(";")) {
    const name = cookie.split("=", 1)[0]?.trim();

    if (name === "_ga" || name?.startsWith("_ga_")) {
      document.cookie = `${name}=; Max-Age=0; Path=/; SameSite=Lax`;
      document.cookie = `${name}=; Max-Age=0; Path=/; Domain=${hostname}; SameSite=Lax`;
      document.cookie = `${name}=; Max-Age=0; Path=/; Domain=.${hostname}; SameSite=Lax`;
    }
  }
}

export function AnalyticsConsentLayer() {
  const [consent, setConsent] = useState<AnalyticsConsent | null>(null);
  const [isReady, setIsReady] = useState(false);
  const [isSettingsOpen, setIsSettingsOpen] = useState(false);
  const [measurementId, setMeasurementId] = useState<string | null>(null);

  useEffect(() => {
    let isCurrent = true;
    const storedConsent = window.localStorage.getItem(ANALYTICS_CONSENT_STORAGE_KEY);
    const initialConsent = storedConsent === "granted" || storedConsent === "denied"
      ? storedConsent
      : null;

    fetch("/api/analytics-config", { cache: "no-store" })
      .then(async (response) => response.ok
        ? response.json() as Promise<{ measurementId?: unknown }>
        : null)
      .then((config) => {
        if (!isCurrent) return;
        setConsent(initialConsent);
        setMeasurementId(typeof config?.measurementId === "string" ? config.measurementId : null);
      })
      .catch(() => {
        if (!isCurrent) return;
        setConsent(initialConsent);
        setMeasurementId(null);
      })
      .finally(() => {
        if (isCurrent) setIsReady(true);
      });

    function openSettings() {
      setIsSettingsOpen(true);
    }

    window.addEventListener(OPEN_ANALYTICS_SETTINGS_EVENT, openSettings);

    return () => {
      isCurrent = false;
      window.removeEventListener(OPEN_ANALYTICS_SETTINGS_EVENT, openSettings);
    };
  }, []);

  function saveConsent(nextConsent: AnalyticsConsent) {
    const shouldReload = consent === "granted" && nextConsent === "denied";

    window.localStorage.setItem(ANALYTICS_CONSENT_STORAGE_KEY, nextConsent);
    setConsent(nextConsent);
    setIsSettingsOpen(false);

    if (nextConsent === "denied") {
      clearGoogleAnalyticsCookies();
    }

    if (shouldReload) {
      window.location.reload();
    }
  }

  const shouldShowSettings = isReady
    && measurementId !== null
    && (consent === null || isSettingsOpen);

  return (
    <>
      {measurementId && consent === "granted"
        ? <GoogleAnalytics gaId={measurementId} />
        : null}
      {shouldShowSettings ? (
        <section
          aria-labelledby="analytics-consent-title"
          aria-modal={isSettingsOpen ? true : undefined}
          className="archive-paper-surface fixed inset-x-3 bottom-[max(0.75rem,env(safe-area-inset-bottom))] z-[110] mx-auto max-w-xl rounded-lg border border-stone-500/60 p-4 text-stone-800 shadow-[0_18px_45px_rgba(28,25,23,0.34)] sm:inset-x-5 sm:p-5"
          role={isSettingsOpen ? "dialog" : "region"}
        >
          {isSettingsOpen && consent !== null ? (
            <Button
              aria-label="Закрыть настройки аналитики"
              className="absolute right-2 top-2 size-9"
              onClick={() => setIsSettingsOpen(false)}
              size="icon"
              type="button"
              variant="ghost"
            >
              <X aria-hidden="true" className="size-5" />
            </Button>
          ) : null}
          <h2 id="analytics-consent-title" className="pr-9 font-serif text-xl text-stone-950">
            Аналитика сайта
          </h2>
          <p className="mt-2 text-sm leading-6 text-stone-600">
            Google Analytics помогает понять, какие разделы архива полезны. Аналитика включится
            только с вашего разрешения. Подробнее — в{" "}
            <Link className="underline underline-offset-4 hover:text-stone-950" href="/privacy">
              политике конфиденциальности
            </Link>.
          </p>
          <div className="mt-4 grid grid-cols-2 gap-2">
            <Button
              className="w-full px-1 text-[11px] sm:px-4 sm:text-sm"
              type="button"
              variant="outline"
              onClick={() => saveConsent("denied")}
            >
              Только необходимые
            </Button>
            <Button
              className="w-full px-1 text-[11px] sm:px-4 sm:text-sm"
              type="button"
              onClick={() => saveConsent("granted")}
            >
              Разрешить аналитику
            </Button>
          </div>
        </section>
      ) : null}
    </>
  );
}
