import "server-only";
import { setTimeout as pause } from "node:timers/promises";
import { getActiveProviderRequestTimeoutMs, ProviderHttpError, withProviderTimeout } from "@/lib/covers/providers/shared";
import { providerRequestStartedAt, saveProviderSnapshot, type SnapshotJobGuard } from "@/db/queries/provider-snapshots";
import type { JSONValue } from "@/lib/providers/types";
import type { SnapshotReference } from "@/lib/providers/snapshot-values";
import { normalizeSearchText } from "@/lib/search/normalize";
import { isShikimoriManga, mangaUpdatesLinkIdentity, matchesMangaUpdates, shikimoriRetryAfterSeconds, type ShikimoriManga } from "./manga-shikimori-model";
import { resolveMangaUpdatesLegacyUrl } from "./manga-shikimori-redirect";

type Response = { data?: { mangas?: ShikimoriManga[] }; errors?: unknown };
export type MangaShikimoriResult = { manga: ShikimoriManga | null; snapshot?: SnapshotReference; identitySnapshots?: SnapshotReference[] };
/** Search supplies candidates only; an external MangaUpdates link is mandatory evidence. */
export async function fetchMangaShikimori(input: { titles: string[]; evidenceUrls: string[]; boundId?: string; guard?: SnapshotJobGuard; signal?: AbortSignal; pauseMs?: number }): Promise<MangaShikimoriResult> {
  const seen = new Set<string>();
  const redirects = new Map<string, Awaited<ReturnType<typeof resolveMangaUpdatesLegacyUrl>>>();
  const searches = input.titles.filter(title => {
    const normalized = normalizeSearchText(title);
    if (!normalized || seen.has(normalized)) return false;
    seen.add(normalized); return true;
  }).slice(0, 5);
  const requests: Array<Record<string, string>> = input.boundId ? [{ ids: input.boundId }] : searches.map(search => ({ search }));
  for (const [index, variables] of requests.entries()) {
    input.signal?.throwIfAborted();
    if (index > 0 && input.pauseMs) await pause(input.pauseMs, undefined, { signal: input.signal });
    const requestStartedAt = await providerRequestStartedAt();
    const query = input.boundId
      ? `query MangaById($ids: String!) { mangas(ids: $ids, limit: 50) { id russian description externalLinks { url } } }`
      : `query MangaCandidates($search: String!) { mangas(search: $search, limit: 50) { id russian description externalLinks { url } } }`;
    const http = await fetch("https://shikimori.io/api/graphql", {
      method: "POST", headers: { accept: "application/json", "content-type": "application/json" },
      body: JSON.stringify({ query, variables }), redirect: "error", signal: withProviderTimeout(getActiveProviderRequestTimeoutMs(), input.signal),
    });
    if (!http.ok) {
      await http.body?.cancel();
      throw Object.assign(new ProviderHttpError(http.status, null), { retryAfterSeconds: shikimoriRetryAfterSeconds(http.headers.get("retry-after")) });
    }
    const response = await http.json() as Response;
    if (response.errors || !Array.isArray(response.data?.mangas) || !response.data.mangas.every(isShikimoriManga)) throw new Error("SHIKIMORI_INVALID_RESPONSE");
    const evidenceUrls = [...input.evidenceUrls];
    const identitySnapshots: SnapshotReference[] = [];
    if (!response.data.mangas.some(manga => matchesMangaUpdates(manga, evidenceUrls))) {
      legacyCandidates: for (const manga of response.data.mangas.slice(0, 5)) {
        for (const link of manga.externalLinks ?? []) {
          if (!link.url || !mangaUpdatesLinkIdentity(link.url)?.startsWith("legacy:")) continue;
          if (!redirects.has(link.url)) {
            if (redirects.size >= 5) continue;
            if (redirects.size) await pause(Math.max(1000, input.pauseMs ?? 0), undefined, { signal: input.signal });
            redirects.set(link.url, await resolveMangaUpdatesLegacyUrl(link.url, input.guard, input.signal));
          }
          const resolved = redirects.get(link.url);
          if (resolved && input.evidenceUrls.some(url => mangaUpdatesLinkIdentity(url) === mangaUpdatesLinkIdentity(resolved.canonicalUrl))) {
            evidenceUrls.push(resolved.legacyUrl);
            identitySnapshots.push(resolved.snapshot);
            break legacyCandidates;
          }
        }
      }
    }
    const matches = response.data.mangas.filter(manga => matchesMangaUpdates(manga, evidenceUrls));
    // Ambiguous provider evidence must be resolved manually rather than picking a title match.
    if (matches.length > 1) return { manga: null };
    if (!matches.length) continue;
    const manga = matches[0];
    const snapshot = await saveProviderSnapshot({ providerCode: "shikimori", resourceType: "manga", externalId: String(manga.id), apiMethod: "mangas.graphql", requestParams: variables, payload: response as JSONValue, payloadHash: "", contentType: "application/json", requestStartedAt, fetchedAt: new Date() }, input.guard);
    return { manga, snapshot: { id: snapshot.id, payloadHash: snapshot.payloadHash }, identitySnapshots };
  }
  return { manga: null };
}
