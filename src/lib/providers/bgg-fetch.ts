import { BggRequestError, createBggRuntime } from "@/lib/covers/providers/bgg-runtime";
import { MAX_BGG_XML_BYTES } from "./bgg-xml";

const API = "https://boardgamegeek.com/xmlapi2/";
export type BggFetchDependencies = { fetch?: typeof fetch; runtime?: ReturnType<typeof createBggRuntime> };
const defaultRuntime = createBggRuntime();

export async function fetchBggXml(path: "search" | "thing", params: Record<string, string>, ctx: { token: string; signal: AbortSignal }, dependencies: BggFetchDependencies = {}) {
  const runtime = dependencies.runtime ?? defaultRuntime;
  const fetchImplementation = dependencies.fetch ?? globalThis.fetch;
  await runtime.waitForRequest(ctx.signal);
  const url = new URL(path, API);
  for (const [key, value] of Object.entries(params)) url.searchParams.set(key, value);
  const response = await fetchImplementation(url, { headers: { accept: "application/xml", Authorization: `Bearer ${ctx.token}` }, signal: ctx.signal, redirect: "error", cache: "no-store" });
  if (response.status === 202 || !response.ok) {
    await response.body?.cancel();
    const retry = response.headers.get("retry-after");
    const seconds = retry && /^\d+$/.test(retry) ? Number(retry) : retry ? Math.max(0, Math.ceil((Date.parse(retry) - Date.now()) / 1000)) : 60;
    const retryAfter = Number.isFinite(seconds) ? Math.min(86_400, Math.max(5, seconds)) : 60;
    if ([202, 429, 500, 502, 503, 504].includes(response.status)) await runtime.cooldown(retryAfter, ctx.signal);
    throw new BggRequestError(response.status === 429 ? "provider-rate-limit" : "provider-unavailable", response.status, retryAfter,
      response.status === 401 || (response.status === 403 && /xml/i.test(response.headers.get("content-type") ?? "")));
  }
  if (/html/i.test(response.headers.get("content-type") ?? "")) { await response.body?.cancel(); throw new BggRequestError("provider-unavailable"); }
  if (!response.body || Number(response.headers.get("content-length")) > MAX_BGG_XML_BYTES) { await response.body?.cancel(); throw new BggRequestError("provider-unavailable"); }
  const reader = response.body.getReader();
  const chunks: Uint8Array[] = [];
  let size = 0;
  try {
    while (true) {
      const { done, value } = await reader.read();
      if (done) break;
      size += value.byteLength;
      if (size > MAX_BGG_XML_BYTES) throw new BggRequestError("provider-unavailable");
      chunks.push(value);
    }
  } finally { await reader.cancel(); }
  return Buffer.concat(chunks).toString("utf8");
}
