import { createHash } from "node:crypto";
import { getActiveProviderRequestTimeoutMs, ProviderHttpError, withProviderTimeout } from "@/lib/covers/providers/shared";
import { acquireFantlabRequestSlot, retryAfterMs } from "@/lib/creators/fantlab-api";
import { buildBookSnapshotUrl, getBookDependencyDescriptors, normalizeBookSnapshots } from "./book-adapters";
import type { JSONValue, RawSnapshot, SnapshotDescriptor } from "./types";

export type SnapshotFetchOptions = {
  beforeRequest: (descriptor: SnapshotDescriptor) => Promise<void>;
  requestStartedAt: () => Promise<Date>;
  saveSnapshot: (snapshot: RawSnapshot) => Promise<RawSnapshot>;
  fetchImpl?: typeof fetch;
  apiKey?: string;
  signal?: AbortSignal;
  reuseSnapshot?: (descriptor: SnapshotDescriptor) => Promise<RawSnapshot | null>;
  acquireFantlabSlot?: (signal: AbortSignal) => Promise<(cooldownMs: number) => Promise<void>>;
};

const MAX_JSON_BYTES = 2 * 1024 * 1024;

export class SnapshotProviderHttpError extends ProviderHttpError {
  constructor(status: number, readonly retryAfterSeconds: number) { super(status, null); }
}

export async function boundedJson(response: Response): Promise<JSONValue> {
  if (!response.body || Number(response.headers.get("content-length")) > MAX_JSON_BYTES) {
    await response.body?.cancel();
    throw new Error("Слишком большой или пустой ответ источника.");
  }
  const reader = response.body.getReader();
  const chunks: Uint8Array[] = [];
  let bytes = 0;
  try {
    while (true) {
      const chunk = await reader.read();
      if (chunk.done) break;
      bytes += chunk.value.byteLength;
      if (bytes > MAX_JSON_BYTES) { await reader.cancel(); throw new Error("Слишком большой ответ источника."); }
      chunks.push(chunk.value);
    }
  } finally { reader.releaseLock(); }
  return JSON.parse(Buffer.concat(chunks).toString("utf8")) as JSONValue;
}

// One budget reservation per actual HTTP request. Retries belong to the job infrastructure.
export async function fetchBookSnapshot(descriptor: SnapshotDescriptor, options: SnapshotFetchOptions): Promise<RawSnapshot> {
  const url = buildBookSnapshotUrl(descriptor, options.apiKey);
  await options.beforeRequest(descriptor);
  const parentSignal = options.signal ?? AbortSignal.timeout(120_000);
  const release = descriptor.providerCode === "fantlab" ? await (options.acquireFantlabSlot ?? acquireFantlabRequestSlot)(parentSignal) : null;
  let cooldownMs = 1000;
  let payload: JSONValue;
  let contentType: string;
  let requestStartedAt: Date;
  try {
    requestStartedAt = await options.requestStartedAt();
    const timeoutMs = descriptor.providerCode === "fantlab" ? Math.min(15_000, getActiveProviderRequestTimeoutMs()) : getActiveProviderRequestTimeoutMs();
    const response = await (options.fetchImpl ?? fetch)(url, { headers: { accept: "application/json" }, redirect: "error", signal: withProviderTimeout(timeoutMs, parentSignal) });
    if (!response.ok) {
      cooldownMs = retryAfterMs(response.headers.get("retry-after"));
      await response.body?.cancel();
      if (response.status === 429 || response.status >= 500) throw new SnapshotProviderHttpError(response.status, Math.ceil(cooldownMs / 1000));
      throw new ProviderHttpError(response.status, null);
    }
    payload = await boundedJson(response);
    contentType = response.headers.get("content-type") ?? "application/json";
  } finally { await release?.(cooldownMs); }
  // Validate the requested resource before replacing a usable snapshot.
  if (descriptor.resourceType === "author") {
    if (!payload || Array.isArray(payload) || typeof payload !== "object" || payload.key !== descriptor.externalId || typeof payload.name !== "string" || !payload.name.trim()) throw new Error("Incomplete Open Library author response.");
  } else {
    getBookDependencyDescriptors({ ...descriptor, payload });
    if (descriptor.providerCode !== "open-library" && !normalizeBookSnapshots({ ...descriptor, payload }).contributorsComplete) throw new Error("Incomplete book contributor response.");
    if (descriptor.providerCode === "open-library" && (!payload || typeof payload !== "object" || Array.isArray(payload) || !Array.isArray(payload.authors))) throw new Error("Incomplete Open Library work response.");
  }
  return options.saveSnapshot({ ...descriptor, payload, payloadHash: createHash("sha256").update(JSON.stringify(payload)).digest("hex"), contentType, requestStartedAt, fetchedAt: new Date() });
}

export async function fetchBookSnapshotBundle(descriptor: SnapshotDescriptor, options: SnapshotFetchOptions) {
  const primary = await options.reuseSnapshot?.(descriptor) ?? await fetchBookSnapshot(descriptor, options);
  const dependencies: RawSnapshot[] = [];
  for (const dependency of getBookDependencyDescriptors(primary)) dependencies.push(await options.reuseSnapshot?.(dependency) ?? await fetchBookSnapshot(dependency, options));
  return { primary, dependencies };
}
