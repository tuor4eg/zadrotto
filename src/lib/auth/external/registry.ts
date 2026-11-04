import "server-only";

import { getAuthProviderConfiguration } from "@/db/queries/auth-provider-settings";
import { isExternalProviderAvailable } from "./model";
import { createYandexAdapter } from "./yandex";

// Adapter code and endpoints are trusted server code, never request configuration.
export async function getExternalAuthAdapter(code: string) {
  if (code !== "yandex") return null;
  return createYandexAdapter(await getAuthProviderConfiguration(code));
}

export async function getExternalAuthAdapters() {
  return [await getExternalAuthAdapter("yandex")].filter((adapter) => adapter !== null);
}

export async function getAvailableExternalProviders() {
  return (await getExternalAuthAdapters()).filter(isExternalProviderAvailable).map(({ code, name }) => ({ code, name }));
}
