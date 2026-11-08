"use client";

import { useEffect, useState } from "react";
import { Button } from "@/components/ui/button";
import { YandexIdButton } from "./yandex-id-button";
import type { ExternalProviderPublic } from "@/lib/auth/external/model";

// Shared by the full login page and the client-side login modal.
export function ExternalProviderButtons() {
  const [providers, setProviders] = useState<ExternalProviderPublic[]>([]);
  useEffect(() => {
    const controller = new AbortController();
    fetch("/author/auth/providers", { cache: "no-store", signal: controller.signal })
      .then((response) => response.ok ? response.json() : [])
      .then((items: ExternalProviderPublic[]) => setProviders(items))
      .catch(() => {});
    return () => controller.abort();
  }, []);
  if (!providers.length) return null;
  return <div className="grid gap-4" aria-label="Внешние способы входа">
    <div className="flex items-center gap-3 text-xs text-stone-500" aria-hidden="true">
      <span className="h-px flex-1 bg-stone-400/30" />
      <span>или</span>
      <span className="h-px flex-1 bg-stone-400/30" />
    </div>
    {providers.map((provider) => <form key={provider.code} method="post" action={`/author/auth/${encodeURIComponent(provider.code)}/start`}>
      <input type="hidden" name="intent" value="login" />
      {provider.code === "yandex" ? (
        <YandexIdButton label="Войти через Яндекс ID" />
      ) : (
        <Button type="submit" variant="outline" className="w-full">Войти через {provider.name}</Button>
      )}
    </form>)}
  </div>;
}
