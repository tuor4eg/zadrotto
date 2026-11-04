"use client";

import { useEffect, useState } from "react";
import { Button } from "@/components/ui/button";
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
  return <div className="grid gap-2" aria-label="Внешние способы входа">
    {providers.map((provider) => <form key={provider.code} method="post" action={`/author/auth/${encodeURIComponent(provider.code)}/start`}>
      <input type="hidden" name="intent" value="login" />
      <Button type="submit" variant="outline" className="w-full">Войти через {provider.name}</Button>
    </form>)}
  </div>;
}
