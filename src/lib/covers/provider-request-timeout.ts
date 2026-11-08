import { AsyncLocalStorage } from "node:async_hooks";

import {
  DEFAULT_PROVIDER_REQUEST_TIMEOUT_MS,
  resolveProviderRequestTimeoutMs,
} from "@/lib/covers/config";
import { bindProviderRequestTimeoutResolver, bindProviderRequestSignalResolver, bindProviderStrictHttpErrorsResolver } from "@/lib/covers/providers/shared";

const providerRequestTimeoutStore = new AsyncLocalStorage<{ timeoutMs: number; signal?: AbortSignal; strictHttpErrors?: boolean }>();

bindProviderRequestTimeoutResolver(() =>
  resolveProviderRequestTimeoutMs(
    providerRequestTimeoutStore.getStore()?.timeoutMs ?? DEFAULT_PROVIDER_REQUEST_TIMEOUT_MS,
  ),
);

bindProviderRequestSignalResolver(() => providerRequestTimeoutStore.getStore()?.signal);
bindProviderStrictHttpErrorsResolver(() => providerRequestTimeoutStore.getStore()?.strictHttpErrors === true);

export function getActiveProviderRequestTimeoutMs() {
  return resolveProviderRequestTimeoutMs(
    providerRequestTimeoutStore.getStore()?.timeoutMs ?? DEFAULT_PROVIDER_REQUEST_TIMEOUT_MS,
  );
}

export function runWithProviderRequestTimeout<T>(
  timeoutMs: number,
  operation: () => T | Promise<T>,
  signal?: AbortSignal,
  options?: { strictHttpErrors?: boolean },
): T | Promise<T> {
  return providerRequestTimeoutStore.run(
    { timeoutMs: resolveProviderRequestTimeoutMs(timeoutMs), signal: signal ?? providerRequestTimeoutStore.getStore()?.signal, strictHttpErrors: options?.strictHttpErrors ?? providerRequestTimeoutStore.getStore()?.strictHttpErrors },
    operation,
  );
}
