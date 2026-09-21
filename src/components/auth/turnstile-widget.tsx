"use client";

import Script from "next/script";
import { useCallback, useEffect, useRef, useState } from "react";

const TURNSTILE_SCRIPT_URL = "https://challenges.cloudflare.com/turnstile/v0/api.js?render=explicit";

type TurnstileApi = {
  remove(widgetId: string): void;
  render(
    container: HTMLElement,
    options: {
      action: string;
      callback(token: string): void;
      "error-callback"(): void;
      "expired-callback"(): void;
      sitekey: string;
      theme: "auto";
    },
  ): string;
  reset(widgetId: string): void;
};

declare global {
  interface Window {
    turnstile?: TurnstileApi;
  }
}

export function TurnstileWidget({
  action,
  fieldName,
  onVerifiedChange,
  resetKey,
  siteKey,
}: {
  action: string;
  fieldName: string;
  onVerifiedChange: (verified: boolean) => void;
  resetKey: unknown;
  siteKey: string;
}) {
  const containerRef = useRef<HTMLDivElement>(null);
  const widgetIdRef = useRef<string | null>(null);
  const [hasError, setHasError] = useState(false);
  const [token, setToken] = useState("");

  const updateToken = useCallback((nextToken: string) => {
    setToken(nextToken);
    onVerifiedChange(Boolean(nextToken));
  }, [onVerifiedChange]);

  const renderWidget = useCallback(() => {
    if (!containerRef.current || !window.turnstile || widgetIdRef.current) return;

    widgetIdRef.current = window.turnstile.render(containerRef.current, {
      action,
      callback: (nextToken) => {
        setHasError(false);
        updateToken(nextToken);
      },
      "error-callback": () => {
        setHasError(true);
        updateToken("");
      },
      "expired-callback": () => updateToken(""),
      sitekey: siteKey,
      theme: "auto",
    });
  }, [action, siteKey, updateToken]);

  useEffect(() => {
    if (!widgetIdRef.current || !window.turnstile) return;

    window.turnstile.reset(widgetIdRef.current);
    updateToken("");
  }, [resetKey, updateToken]);

  useEffect(() => () => {
    if (widgetIdRef.current && window.turnstile) {
      window.turnstile.remove(widgetIdRef.current);
    }
  }, []);

  return (
    <>
      <Script
        src={TURNSTILE_SCRIPT_URL}
        strategy="afterInteractive"
        onReady={renderWidget}
        onError={() => {
          setHasError(true);
          updateToken("");
        }}
      />
      <div ref={containerRef} />
      {hasError ? (
        <p className="text-sm text-red-700" role="alert">
          Не удалось загрузить проверку. Обнови страницу и попробуй ещё раз.
        </p>
      ) : null}
      <input name={fieldName} type="hidden" value={token} />
    </>
  );
}
