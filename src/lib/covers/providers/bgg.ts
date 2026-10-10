import { XMLParser, XMLValidator } from "fast-xml-parser";
import { normalizeSearchText } from "@/lib/search/normalize";
import { normalizeMediaItemTitleAliases } from "@/lib/media/title-aliases";
import type { CoverCandidate, MediaProvider, MediaTitleCandidate, ProviderSearchOptions } from "@/lib/covers/types";
import { getActiveProviderRequestTimeoutMs } from "./shared";
import { BggRequestError, createBggRuntime } from "./bgg-runtime";

const API = "https://boardgamegeek.com/xmlapi2/";
const TYPES = "boardgame,boardgameexpansion";
const MAX_XML_BYTES = 2 * 1024 * 1024;
const IMAGE_HOSTS = new Set(["cf.geekdo-images.com"]);
type XmlNode = Record<string, unknown>;
type BggItem = {
  id: string; type: string; title: string; alternateNames: string[];
  year: number | null; description: string | null; image: string | null;
  facts: Record<string, unknown>;
};

function record(value: unknown): XmlNode {
  return value && typeof value === "object" && !Array.isArray(value) ? value as XmlNode : {};
}
function list(value: unknown): XmlNode[] {
  return (Array.isArray(value) ? value : value == null ? [] : [value]).map(record);
}
function text(value: unknown) {
  return typeof value === "string" ? value.trim() : "";
}
function positive(value: unknown) {
  const number = Number(value);
  return Number.isSafeInteger(number) && number > 0 ? number : null;
}
export function normalizeBggId(value: string) {
  return /^\d+$/.test(value) && positive(value) ? String(Number(value)) : null;
}
export function getBggQueryId(query: string) {
  if (/^bgg:/i.test(query)) return normalizeBggId(query.slice(4).trim());
  try {
    const url = new URL(query);
    return url.protocol === "https:" && url.hostname === "boardgamegeek.com" && !url.username && !url.password && !url.port
      ? normalizeBggId(url.pathname.match(/^\/boardgame\/(\d+)(?:\/|$)/)?.[1] ?? "") : null;
  } catch { return null; }
}
function imageUrl(value: unknown) {
  try {
    const url = new URL(text(value));
    return url.protocol === "https:" && IMAGE_HOSTS.has(url.hostname) && !url.username && !url.password && !url.port ? url.href : null;
  } catch { return null; }
}
export function parseBggXml(xml: string): XmlNode[] {
  if (Buffer.byteLength(xml) > MAX_XML_BYTES || /<!\s*(?:DOCTYPE|ENTITY)\b/i.test(xml) || XMLValidator.validate(xml) !== true) {
    throw new BggRequestError("provider-unavailable");
  }
  const parsed = record(new XMLParser({ ignoreAttributes: false, parseTagValue: false, parseAttributeValue: false, htmlEntities: true }).parse(xml));
  if (!Object.hasOwn(parsed, "items") || Object.keys(parsed).some((key) => key !== "items" && key !== "?xml")) {
    throw new BggRequestError("provider-unavailable");
  }
  const root = record(parsed.items);
  if (root.error || root.errors) throw new BggRequestError("provider-unavailable");
  return list(root.item);
}
function parseItem(node: XmlNode, full: boolean): BggItem {
  const id = normalizeBggId(text(node["@_id"]));
  const type = text(node["@_type"]);
  const names = list(node.name);
  const title = text((names.find((name) => name["@_type"] === "primary") ?? names[0])?.["@_value"]);
  if (!id || !TYPES.split(",").includes(type) || !title) throw new BggRequestError("provider-unavailable");
  const alternateNames = normalizeMediaItemTitleAliases(names.filter((name) => name["@_type"] === "alternate").map((name) => text(name["@_value"])), { title, originalTitle: title });
  const links = list(node.link);
  const values = (kind: string) => [...new Set(links.filter((link) => link["@_type"] === kind).map((link) => text(link["@_value"])).filter(Boolean))];
  const genres = values("boardgamecategory");
  const year = positive(record(node.yearpublished)["@_value"]);
  const facts: Record<string, unknown> = full ? {
    bggItemType: type, authors: values("boardgamedesigner"), artists: values("boardgameartist"),
    publishers: values("boardgamepublisher"), mechanics: values("boardgamemechanic"), genres,
    genreReferences: genres.flatMap((name) => {
      const link = links.find((link) => link["@_type"] === "boardgamecategory" && text(link["@_value"]) === name);
      const genreId = normalizeBggId(text(link?.["@_id"]));
      return genreId ? [{ name, id: genreId }] : [];
    }),
    minPlayers: positive(record(node.minplayers)["@_value"]), maxPlayers: positive(record(node.maxplayers)["@_value"]),
    runtimeMinutes: positive(record(node.playingtime)["@_value"]),
    minPlayingTimeMinutes: positive(record(node.minplaytime)["@_value"]), maxPlayingTimeMinutes: positive(record(node.maxplaytime)["@_value"]),
    minAge: positive(record(node.minage)["@_value"]),
  } : {};
  return { id, type, title, alternateNames, year: year && year <= 9999 ? year : null, description: text(node.description) || null,
    image: imageUrl(node.image) ?? imageUrl(node.thumbnail), facts };
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
  async function request(path: string, params: Record<string, string>, ctx: ReturnType<typeof context>) {
    await runtime.waitForRequest(ctx.signal);
    const url = new URL(path, API);
    for (const [key, value] of Object.entries(params)) url.searchParams.set(key, value);
    const response = await fetchImplementation(url, { headers: { accept: "application/xml", Authorization: `Bearer ${ctx.token}` }, signal: ctx.signal, redirect: "error", cache: "no-store" });
    if (response.status === 202 || !response.ok) {
      const retry = response.headers.get("retry-after");
      const seconds = retry && /^\d+$/.test(retry) ? Number(retry) : retry ? Math.max(0, Math.ceil((Date.parse(retry) - Date.now()) / 1000)) : 60;
      const retryAfter = Number.isFinite(seconds) ? Math.min(86_400, Math.max(5, seconds)) : 60;
      if ([202, 429, 500, 502, 503, 504].includes(response.status)) await runtime.cooldown(retryAfter, ctx.signal);
      throw new BggRequestError(response.status === 429 ? "provider-rate-limit" : "provider-unavailable", response.status, retryAfter,
        response.status === 401 || (response.status === 403 && /xml/i.test(response.headers.get("content-type") ?? "")));
    }
    if (/html/i.test(response.headers.get("content-type") ?? "")) throw new BggRequestError("provider-unavailable");
    if (!response.body || Number(response.headers.get("content-length")) > MAX_XML_BYTES) throw new BggRequestError("provider-unavailable");
    const reader = response.body.getReader();
    const chunks: Uint8Array[] = [];
    let size = 0;
    try {
      while (true) {
        const { done, value } = await reader.read();
        if (done) break;
        size += value.byteLength;
        if (size > MAX_XML_BYTES) throw new BggRequestError("provider-unavailable");
        chunks.push(value);
      }
    } finally { await reader.cancel(); }
    return parseBggXml(Buffer.concat(chunks).toString("utf8"));
  }
  async function things(ids: string[], ctx: ReturnType<typeof context>) {
    let batch: Promise<BggItem[]> | undefined;
    const fetchBatch = async () => {
      const nodes = await request("thing", { id: ids.join(","), type: TYPES }, ctx);
      const values = nodes.map((node) => parseItem(node, true));
      if (values.some((item) => !ids.includes(item.id)) || new Set(values.map((item) => item.id)).size !== values.length) throw new BggRequestError("provider-unavailable");
      return values;
    };
    if (ctx.bypassCache) return fetchBatch();
    // Per-ID leases can be acquired by different workers during simultaneous batches.
    // A short batch lease/cache prevents both workers from fetching the same ID set.
    const loadBatch = () => runtime.cached(ctx.token, `thing-batch:${[...ids].sort().join(",")}`, 60, ctx.signal, fetchBatch);
    const items = await Promise.all(ids.map((id) => runtime.cached(ctx.token, `thing:${id}`, (item: BggItem | null) => item ? 86_400 : 60, ctx.signal, async () => {
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
    const loadSearch = async () => (await request("search", { query, type: TYPES }, ctx)).map((node) => parseItem(node, false));
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
      const item = (await things([id], context(options)))[0];
      if (!item) return null;
      return { provider: "bgg", externalId: item.id, sourceUrl: source(item),
        // Older cached cards may still contain the formerly persisted list.
        facts: Object.fromEntries(Object.entries(item.facts).filter(([key]) => key !== "alternateNames")),
        fields: { title: item.title, originalTitle: item.title, description: item.description, releaseYear: item.year,
          aliases: item.alternateNames.filter((name) => /[\u0400-\u04ff]/u.test(name)) } };
    },
  };
}
export const bggProvider = createBggProvider();
