import { randomUUID } from "node:crypto";
import { setTimeout as delay } from "node:timers/promises";
import { getRedisClient } from "@/lib/services/redis";
import { normalizeSearchText } from "@/lib/search/normalize";
import { isSafeProviderImageUrl } from "@/lib/covers/provider-image-relay";
import type { JSONValue } from "@/lib/providers/types";

export type FantlabAuthor = { id: string; name: string; originalName: string | null; imageUrl: string | null; previewUrl: string | null; sourceUrl: string };
export type FantlabSearchCandidate = { id: string; names: string[] };
const API = "https://api.fantlab.ru";
const MAX_JSON_BYTES = 2 * 1024 * 1024;
const LEASE_MS = 30_000;
const RELEASE = "if redis.call('GET',KEYS[1]) == ARGV[1] then redis.call('DEL',KEYS[1]); redis.call('SET',KEYS[2],'1','PX',ARGV[2]); return 1 end return 0";

function record(value: unknown): Record<string, unknown> {
  if (!value || typeof value !== "object" || Array.isArray(value)) throw new Error("Некорректный ответ FantLab.");
  return value as Record<string, unknown>;
}
function name(value: unknown) { return typeof value === "string" ? value.trim() : ""; }
export function parseFantlabId(value: unknown) {
  const id = typeof value === "number" && Number.isSafeInteger(value) ? String(value) : name(value);
  if (!/^[1-9]\d*$/.test(id) || !Number.isSafeInteger(Number(id))) throw new Error("Некорректный FantLab ID.");
  return id;
}
function image(value: unknown) {
  const raw = name(value);
  if (!raw) return null;
  try {
    const url = new URL(raw, "https://fantlab.ru");
    return isSafeProviderImageUrl("fantlab", url.href) ? url.href : null;
  } catch { return null; }
}
export function parseFantlabAuthor(value: unknown, expectedId: string, options: { allowClosed?: boolean } = {}): FantlabAuthor {
  const row = record(value);
  const id = parseFantlabId(row.autor_id ?? row.id);
  if (id !== expectedId || (row.id != null && parseFantlabId(row.id) !== id) || row.type !== "autor"
    || !(options.allowClosed ? [0, "0", false, 1, "1", true] : [1, "1", true]).includes(row.is_opened as string | number | boolean) || !name(row.name)) throw new Error("Автор FantLab недоступен или ID не совпадает.");
  return { id, name: name(row.name), originalName: name(row.name_orig) || null,
    imageUrl: image(row.image), previewUrl: image(row.image_preview), sourceUrl: `https://fantlab.ru/autor${id}` };
}
/** Closed bibliographies can still return a complete author JSON, even with HTTP 404. */
export function parseFantlabAuthorSnapshot(value: unknown, expectedId: string) {
  parseFantlabAuthor(value, expectedId, { allowClosed: true });
  const row = record(value) as Record<string, JSONValue>;
  if (typeof row.biography !== "string" || !row.awards || typeof row.awards !== "object") throw new Error("INVALID_CREATOR_SNAPSHOT");
  return row;
}
export function parseFantlabSearchPage(value: unknown) {
  const row = record(value);
  if (row.error || row.warning || !Array.isArray(row.matches)) throw new Error("Неполная выдача поиска FantLab.");
  const numeric = (value: unknown) => (typeof value === "number" || (typeof value === "string" && /^\d+$/.test(value))) ? Number(value) : Number.NaN;
  const total = numeric(row.total_found);
  const available = numeric(row.total);
  if (!Number.isSafeInteger(total) || !Number.isSafeInteger(available) || available < 0 || total < 0 || total > 1000 || available < total) throw new Error("Неполная выдача поиска FantLab.");
  const candidates = row.matches.map(value => {
    const candidate = record(value);
    return { id: parseFantlabId(candidate.autor_id), names: [name(candidate.rusname), name(candidate.name)].filter(Boolean) };
  });
  return { total, candidates };
}
export function selectExactFantlabAuthor(names: readonly string[], candidates: readonly FantlabSearchCandidate[]) {
  const wanted = names.map(normalizeSearchText);
  const ids = new Set(candidates.filter(candidate => candidate.names.some(value => wanted.includes(normalizeSearchText(value)))).map(candidate => candidate.id));
  return ids.size === 1 ? [...ids][0] : null;
}

/** A distributed lease serializes creator API requests across app and worker processes. */
export async function acquireFantlabRequestSlot(signal: AbortSignal) {
  const redis = await getRedisClient();
  if (!redis) throw new Error("Redis недоступен для ограничения запросов FantLab.");
  const owner = randomUUID();
  while (true) {
    signal.throwIfAborted();
    if (!(await redis.exists("fantlab:creators:cooldown")) && await redis.set("fantlab:creators:request", owner, { NX: true, PX: LEASE_MS })) {
      // Recheck after acquisition: another request may have just installed its cooldown.
      if (!(await redis.exists("fantlab:creators:cooldown"))) return async (cooldownMs: number) => {
        await redis.eval(RELEASE, { keys: ["fantlab:creators:request", "fantlab:creators:cooldown"], arguments: [owner, String(Math.max(1000, cooldownMs))] });
      };
      await redis.eval(RELEASE, { keys: ["fantlab:creators:request", "fantlab:creators:cooldown"], arguments: [owner, "1000"] });
    }
    await delay(250, undefined, { signal });
  }
}
export function retryAfterMs(value: string | null, now = Date.now()) {
  if (!value) return 1000;
  const seconds = Number(value);
  return Math.max(1000, Number.isFinite(seconds) ? seconds * 1000 : (Date.parse(value) - now) || 1000);
}
export class FantlabHttpError extends Error {
  constructor(readonly status: number, readonly retryAfterSeconds: number) { super(`FantLab HTTP ${status}`); }
}
export function createFantlabAuthorClient(dependencies: {
  fetch?: typeof fetch;
  acquire?: (signal: AbortSignal) => Promise<(cooldownMs: number) => Promise<void>>;
} = {}) {
  const fetcher = dependencies.fetch ?? fetch;
  async function json(path: string, parentSignal?: AbortSignal, beforeRequest?: () => Promise<void>, attempts = 3, acceptNotFound?: (payload: JSONValue) => void): Promise<JSONValue> {
    const signal = parentSignal ?? AbortSignal.timeout(120_000);
    let lastError: unknown;
    for (let attempt = 0; attempt < attempts; attempt++) {
      signal.throwIfAborted();
      const release = await (dependencies.acquire ?? acquireFantlabRequestSlot)(signal);
      let cooldownMs = 1000;
      let retry = false;
      try {
        await beforeRequest?.();
        const response = await fetcher(`${API}${path}`, { redirect: "error", signal: AbortSignal.any([signal, AbortSignal.timeout(15_000)]), headers: { accept: "application/json" } });
        if (!response.ok && !(response.status === 404 && acceptNotFound)) {
          retry = response.status === 429 || response.status >= 500;
          cooldownMs = retry ? retryAfterMs(response.headers.get("retry-after")) : 1000;
          await response.body?.cancel();
          throw new FantlabHttpError(response.status, Math.ceil(cooldownMs / 1000));
        }
        if (!response.body && response.status === 404) throw new FantlabHttpError(404, 1);
        if (!response.body || Number(response.headers.get("content-length")) > MAX_JSON_BYTES) throw new Error("Слишком большой ответ FantLab.");
        const chunks: Uint8Array[] = [];
        let bytes = 0;
        const reader = response.body.getReader();
        while (true) {
          const next = await reader.read();
          if (next.done) break;
          bytes += next.value.byteLength;
          if (bytes > MAX_JSON_BYTES) { await reader.cancel(); throw new Error("Слишком большой ответ FantLab."); }
          chunks.push(next.value);
        }
        let payload: JSONValue;
        try {
          payload = JSON.parse(Buffer.concat(chunks).toString("utf8"));
          if (response.status === 404) acceptNotFound!(payload);
        } catch (error) {
          if (response.status === 404) throw new FantlabHttpError(404, 1);
          throw error;
        }
        return payload;
      } catch (error) {
        lastError = error;
        if (signal.aborted) signal.throwIfAborted();
        if (error instanceof TypeError || (error instanceof Error && error.name === "TimeoutError")) retry = true;
      } finally { await release(cooldownMs); }
      if (!retry) break;
    }
    throw lastError;
  }
  return {
    /** Jobs own retries; capture the DB-clock timestamp after acquiring the shared slot. */
    async authorRaw(id: string, signal?: AbortSignal, beforeRequest?: () => Promise<void>) {
      const expectedId = parseFantlabId(id);
      return json(`/autor/${expectedId}?biography=1&awards=1`, signal, beforeRequest, 1, payload => { parseFantlabAuthorSnapshot(payload, expectedId); });
    },
    async author(id: string, signal?: AbortSignal) {
      return parseFantlabAuthor(await json(`/autor/${parseFantlabId(id)}`, signal), id);
    },
    async search(query: string, signal?: AbortSignal) {
      const candidates: FantlabSearchCandidate[] = [];
      let total: number | null = null;
      for (let page = 1; page <= 40; page++) {
        const result = parseFantlabSearchPage(await json(`/search-autors?${new URLSearchParams({ q: query, page: String(page), onlymatches: "0" })}`, signal));
        if (total !== null && result.total !== total) throw new Error("Выдача FantLab изменилась во время поиска.");
        total = result.total;
        candidates.push(...result.candidates);
        if (candidates.length >= total) {
          if (candidates.length !== total || new Set(candidates.map(candidate => candidate.id)).size !== total) throw new Error("Неполная выдача поиска FantLab.");
          return candidates;
        }
        if (result.candidates.length !== 25) throw new Error("Неполная выдача поиска FantLab.");
      }
      throw new Error("Неполная выдача поиска FantLab.");
    },
  };
}
const client = createFantlabAuthorClient();
export const getFantlabAuthor = client.author;
export const getFantlabAuthorRaw = client.authorRaw;
export const searchFantlabAuthors = client.search;
