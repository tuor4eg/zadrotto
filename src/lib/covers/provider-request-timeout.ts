import { AsyncLocalStorage } from "node:async_hooks";

import {
  DEFAULT_PROVIDER_REQUEST_TIMEOUT_MS,
  resolveProviderRequestTimeoutMs,
} from "@/lib/covers/config";
import { bindProviderRequestTimeoutResolver } from "@/lib/covers/providers/shared";

const providerRequestTimeoutStore = new AsyncLocalStorage<number>();

bindProviderRequestTimeoutResolver(() =>
  resolveProviderRequestTimeoutMs(
    providerRequestTimeoutStore.getStore() ?? DEFAULT_PROVIDER_REQUEST_TIMEOUT_MS,
  ),
);

export function getActiveProviderRequestTimeoutMs() {
  return resolveProviderRequestTimeoutMs(
    providerRequestTimeoutStore.getStore() ?? DEFAULT_PROVIDER_REQUEST_TIMEOUT_MS,
  );
}

export function runWithProviderRequestTimeout<T>(
  timeoutMs: number,
  operation: () => T | Promise<T>,
): T | Promise<T> {
  return providerRequestTimeoutStore.run(
    resolveProviderRequestTimeoutMs(timeoutMs),
    operation,
  );
}
