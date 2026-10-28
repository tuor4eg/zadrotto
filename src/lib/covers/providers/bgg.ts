import { normalizeBggId, parseBggXml, parseBggItem, type BggItem } from "@/lib/providers/bgg-xml";
import { fetchBggXml } from "@/lib/providers/bgg-fetch";
export { normalizeBggId, parseBggXml } from "@/lib/providers/bgg-xml";
import { normalizeSearchText } from "@/lib/search/normalize";
import type { CoverCandidate, MediaProvider, MediaTitleCandidate, ProviderSearchOptions } from "@/lib/covers/types";
import { getActiveProviderRequestTimeoutMs } from "./shared";
import { BggRequestError, createBggRuntime } from "./bgg-runtime";

const TYPES = "boardgame,boardgameexpansion";
export function getBggQueryId(query: string) {
  if (/^bgg:/i.test(query)) return normalizeBggId(query.slice(4).trim());
  try {
    const url = new URL(query);
    return url.protocol === "https:" && url.hostname === "boardgamegeek.com" && !url.username && !url.password && !url.port
      ? normalizeBggId(url.pathname.match(/^\/boardgame\/(\d+)(?:\/|$)/)?.[1] ?? "") : null;
  } catch { return null; }
}
function source(item: BggItem) { return `https://boardgamegeek.com/boardgame/${item.id}`; }
function candidate(item: BggItem, query: string): MediaTitleCandidate {
  const matched = item.alternateNames.find((name) => normalizeSearchText(name) === normalizeSearchText(query));
  return { id: `bgg:${item.id}`, externalId: item.id, provider: "bgg", mediaType: "boardgame", title: item.title,
    originalTitle: item.title, description: item.description, coverUrl: item.image, releaseYear: item.year, sourcePageUrl: source(item),
    subtitle: [matched, item.type === "boardgameexpansion" ? "Дополнение" : null].filter(Boolean).join(" · ") || null };
}

export function createBggProvider(dependencies: { fetch?: typeof fetch; runtime?: ReturnType<typeof createBggRuntime> } = {}): MediaProvider {
  const fetchImplementation = dependencies.fetch ?? globalThis.fetch;
  const runtime = dependencies.runtime ?? createBggRuntime();
  function context(options: ProviderSearchOptions) {
    const token = options.providerCredentials?.bgg?.accessToken?.trim();
    if (!token) throw new BggRequestError("provider-unavailable", 401, 60, true);
    return { token, bypassCache: options.bypassCache === true, signal: AbortSignal.timeout(options.requestTimeoutMs ?? getActiveProviderRequestTimeoutMs()) };
  }
  async function request(path: "search" | "thing", params: Record<string, string>, ctx: ReturnType<typeof context>) {
    return parseBggXml(await fetchBggXml(path, params, ctx, { fetch: fetchImplementation, runtime }));
  }
  async function things(ids: string[], ctx: ReturnType<typeof context>) {
    let batch: Promise<BggItem[]> | undefined;
    const fetchBatch = async () => {
      const nodes = await request("thing", { id: ids.join(","), type: TYPES }, ctx);
      const values = nodes.map((node) => parseBggItem(node, true));
      if (values.some((item) => !ids.includes(item.id)) || new Set(values.map((item) => item.id)).size !== values.length) throw new BggRequestError("provider-unavailable");
      return values;
    };
    if (ctx.bypassCache) return fetchBatch();
    // Per-ID leases can be acquired by different workers during simultaneous batches.
    // A short batch lease/cache prevents both workers from fetching the same ID set.
    const loadBatch = () => runtime.cached(ctx.token, `thing-creators-v1-batch:${[...ids].sort().join(",")}`, 60, ctx.signal, fetchBatch);
    const items = await Promise.all(ids.map((id) => runtime.cached(ctx.token, `thing-creators-v1:${id}`, (item: BggItem | null) => item ? 86_400 : 60, ctx.signal, async () => {
      batch ??= loadBatch();
      return (await batch).find((item) => item.id === id) ?? null;
    })));
    return items.filter((item): item is BggItem => item !== null);
  }
  async function search(query: string, options: ProviderSearchOptions) {
    const ctx = context(options);
    const directId = getBggQueryId(query);
    if (directId) return (await things([directId], ctx)).map((item) => candidate(item, query));
    if (/^bgg:|^https?:\/\//i.test(query)) return [];
    const loadSearch = async () => (await request("search", { query, type: TYPES }, ctx)).map((node) => parseBggItem(node, false));
    const found = ctx.bypassCache ? await loadSearch() : await runtime.cached(ctx.token, `search:${encodeURIComponent(query)}`, (items: BggItem[]) => items.length ? 900 : 60, ctx.signal, loadSearch);
    const selected = [...new Map(found.map((item) => [item.id, item])).values()].slice(0, Math.min(20, options.candidateLimit));
    if (!selected.length) return [];
    try {
      const full = new Map((await things(selected.map((item) => item.id), ctx)).map((item) => [item.id, item]));
      return selected.map((item) => candidate(full.get(item.id) ?? item, query));
    } catch { return selected.map((item) => candidate(item, query)); }
  }
  function covers(items: MediaTitleCandidate[]): CoverCandidate[] {
    return items.flatMap((item) => item.coverUrl ? [{ id: item.externalId, provider: "bgg" as const, title: item.title, imageUrl: item.coverUrl, sourcePageUrl: item.sourcePageUrl, year: item.releaseYear ?? undefined }] : []);
  }
  return {
    code: "bgg", mediaTypes: ["boardgame"],
    searchTitleCandidates: (input, options) => search(input.query.trim(), options),
    searchCoverCandidates: async (input, options) => covers(await search((input.originalTitle || input.title).trim(), options)),
    async getCoverCandidatesByTitleSource(input, options) {
      const id = normalizeBggId(input.titleSource?.externalId ?? "");
      return id ? covers((await things([id], context(options))).map((item) => candidate(item, ""))) : [];
    },
    async getTitleMetadata(input, options) {
      if (input.mediaType !== "boardgame") return null;
      const id = normalizeBggId(input.externalId);
      if (!id) return null;
      const { fetchBggMetadata } = await import("@/lib/providers/bgg-service");
      return fetchBggMetadata({ ...input, externalId: id }, options, { fetch: fetchImplementation, runtime });
    },
  };
}
export const bggProvider = createBggProvider();
