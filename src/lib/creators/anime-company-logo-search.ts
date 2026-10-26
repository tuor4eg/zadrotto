import { normalizeSearchText } from "@/lib/search/normalize";
import { boundedJson, SnapshotProviderHttpError } from "@/lib/providers/book-fetch";
import type { JSONValue, SnapshotDescriptor } from "@/lib/providers/types";
import { getActiveProviderRequestTimeoutMs, withProviderTimeout } from "@/lib/covers/providers/shared";

export type CompanySearchCandidate = { id: number; name: string; logo_path: string | null; origin_country: string | null };
export type AnimeCompanySearchPayload = { complete: true; query: string; results: CompanySearchCandidate[]; responses?: JSONValue[] };
export function animeCompanySearchDescriptor(studioId: string, query: string): SnapshotDescriptor {
  if (!/^[1-9]\d*$/.test(studioId) || !query.trim()) throw new Error("INVALID_COMPANY_SEARCH");
  return { providerCode: "tmdb", resourceType: "company-search", externalId: studioId, apiMethod: "search.company", requestParams: { query, version: 1 } };
}
export function parseAnimeCompanySearch(value: unknown): AnimeCompanySearchPayload {
  const p = value as AnimeCompanySearchPayload | null;
  if (!p || p.complete !== true || typeof p.query !== "string" || !p.query.trim() || !Array.isArray(p.results)
    || p.results.some(row => !row || !Number.isSafeInteger(row.id) || row.id < 1 || typeof row.name !== "string" || !row.name.trim()
      || (row.logo_path !== null && typeof row.logo_path !== "string") || (row.origin_country !== null && typeof row.origin_country !== "string"))) throw new Error("INVALID_COMPANY_SEARCH");
  const ids = new Map<number, string>();
  for (const row of p.results) {
    if (ids.has(row.id) && ids.get(row.id) !== row.name) throw new Error("CONFLICTING_COMPANY_SEARCH");
    ids.set(row.id, row.name);
  }
  return p;
}
export function exactAnimeCompanyCandidates(payload: AnimeCompanySearchPayload) {
  const normalized = normalizeSearchText(payload.query);
  return payload.results.filter(row => normalizeSearchText(row.name) === normalized);
}
/** All pages are required to prove that an exact normalized name is unique. */
export async function fetchAnimeCompanySearch(query: string, options: { token: string; signal: AbortSignal; beforeRequest: () => Promise<void>; fetchImpl?: typeof fetch }) {
  const candidates = new Map<number, CompanySearchCandidate>();
  const responses: JSONValue[] = [];
  let pages: number | undefined;
  let total: number | undefined;
  for (let page = 1; ; page++) {
    options.signal.throwIfAborted();
    await options.beforeRequest();
    const url = new URL("https://api.themoviedb.org/3/search/company");
    url.searchParams.set("query", query); url.searchParams.set("page", String(page));
    const response = await (options.fetchImpl ?? fetch)(url, { headers: { accept: "application/json", Authorization: `Bearer ${options.token}` }, redirect: "error", signal: withProviderTimeout(getActiveProviderRequestTimeoutMs(), options.signal) });
    if (!response.ok) { const retry = Number(response.headers.get("retry-after")); await response.body?.cancel(); throw new SnapshotProviderHttpError(response.status, retry > 0 ? retry : 60); }
    const raw = await boundedJson(response) as { page?: number; total_pages?: number; total_results?: number; results?: unknown[] };
    if (raw.page !== page || !Number.isSafeInteger(raw.total_pages) || Number(raw.total_pages) < 0 || Number(raw.total_pages) > 500
      || !Number.isSafeInteger(raw.total_results) || Number(raw.total_results) < 0 || !Array.isArray(raw.results)
      || (pages !== undefined && (pages !== raw.total_pages || total !== raw.total_results))) throw new Error("INCOMPLETE_COMPANY_SEARCH");
    responses.push(raw as JSONValue);
    pages = raw.total_pages!; total = raw.total_results!;
    const rows = parseAnimeCompanySearch({ complete: true, query, results: raw.results }).results;
    for (const row of rows) {
      if (candidates.has(row.id) && candidates.get(row.id)!.name !== row.name) throw new Error("CONFLICTING_COMPANY_SEARCH");
      candidates.set(row.id, row);
    }
    if (page >= pages) break;
    if (!rows.length) throw new Error("INCOMPLETE_COMPANY_SEARCH");
  }
  if (candidates.size !== total) throw new Error("INCOMPLETE_COMPANY_SEARCH");
  return { complete: true as const, query, results: [...candidates.values()], responses };
}
