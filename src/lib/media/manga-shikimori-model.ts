import { JobError } from "@/lib/jobs/types";
import { hasCyrillicText } from "@/lib/media/anime-shikimori-language";
import { normalizeMediaItemTitleAliases } from "@/lib/media/title-aliases";
import { needsShikimoriDescriptionRefresh, sanitizeShikimoriDescription } from "@/lib/media/shikimori-description";

export type ShikimoriStats = { processed: number; matched: number; unmatched: number; russianTitles: number; russianDescriptions: number; requestErrors: number; noRussian: number };
export const emptyShikimoriStats = (): ShikimoriStats => ({ processed: 0, matched: 0, unmatched: 0, russianTitles: 0, russianDescriptions: 0, requestErrors: 0, noRussian: 0 });
export type ShikimoriBackfillPayload = { mediaTypes: Array<"anime" | "manga">; batchSize: number; pauseMs: number; afterMediaItemId: number; checkpoint?: { afterMediaItemId: number; counters: ShikimoriStats } };
export function parseShikimoriBackfillPayload(value: unknown): ShikimoriBackfillPayload {
  const invalid = () => new JobError("invalid-payload", "Некорректные параметры обогащения Shikimori.", { retryable: false });
  if (!value || typeof value !== "object" || Array.isArray(value)) throw invalid();
  const source = value as Record<string, unknown>;
  if (Object.keys(source).some(key => !["mediaTypes", "batchSize", "pauseMs", "afterMediaItemId", "checkpoint"].includes(key))) throw invalid();
  const integer = (value: unknown, fallback: number, min: number, max: number) => {
    if (value === undefined) return fallback;
    if (typeof value !== "number" || !Number.isSafeInteger(value) || value < min || value > max) throw invalid();
    return value;
  };
  const mediaTypes = source.mediaTypes ?? ["anime", "manga"];
  if (!Array.isArray(mediaTypes) || !mediaTypes.length || mediaTypes.some(type => type !== "anime" && type !== "manga") || new Set(mediaTypes).size !== mediaTypes.length) throw invalid();
  const result: ShikimoriBackfillPayload = { mediaTypes, batchSize: integer(source.batchSize, 1, 1, 100), pauseMs: integer(source.pauseMs, 1000, 0, 60000), afterMediaItemId: integer(source.afterMediaItemId, 0, 0, 2147483647) };
  if (source.checkpoint !== undefined) {
    if (!source.checkpoint || typeof source.checkpoint !== "object" || Array.isArray(source.checkpoint)) throw invalid();
    const checkpoint = source.checkpoint as Record<string, unknown>;
    if (!checkpoint.counters || typeof checkpoint.counters !== "object" || Array.isArray(checkpoint.counters)) throw invalid();
    const counters = emptyShikimoriStats();
    for (const key of Object.keys(counters) as Array<keyof ShikimoriStats>) counters[key] = integer((checkpoint.counters as Record<string, unknown>)[key], 0, 0, Number.MAX_SAFE_INTEGER);
    result.checkpoint = { afterMediaItemId: integer(checkpoint.afterMediaItemId, 0, 0, 2147483647), counters };
  }
  return result;
}

/** Numeric IDs and new URL tokens are separate namespaces. Only provider evidence joins them. */
export function mangaUpdatesLinkIdentity(value: string): string | null {
  try {
    const url = new URL(value);
    if (!["mangaupdates.com", "www.mangaupdates.com"].includes(url.hostname) || !["https:", "http:"].includes(url.protocol)) return null;
    if (url.pathname === "/series.html") {
      const id = url.searchParams.get("id");
      return id && /^[1-9]\d*$/.test(id) ? `legacy:${id}` : null;
    }
    const token = /^\/series\/([a-z0-9]+)(?:\/|$)/i.exec(url.pathname)?.[1];
    return token ? `token:${token.toLowerCase()}` : null;
  } catch { return null; }
}
export function mangaUpdatesRedirectTarget(payload: unknown): { legacyUrl: string; canonicalUrl: string } | null {
  if (!payload || typeof payload !== "object") return null;
  const raw = payload as { legacyUrl?: unknown; location?: unknown; html?: unknown };
  if (typeof raw.legacyUrl !== "string" || !mangaUpdatesLinkIdentity(raw.legacyUrl)?.startsWith("legacy:")) return null;
  const target = typeof raw.location === "string" ? raw.location
    : typeof raw.html === "string" ? /NEXT_REDIRECT;(?:replace|push);(https:\/\/www\.mangaupdates\.com\/series\/[a-z0-9]+(?:\/[^;"\\\s<>]*)?);30[1278];/i.exec(raw.html)?.[1] : null;
  if (!target) return null;
  let canonicalUrl: string;
  try { canonicalUrl = new URL(target, raw.legacyUrl).href; } catch { return null; }
  return mangaUpdatesLinkIdentity(canonicalUrl)?.startsWith("token:") ? { legacyUrl: raw.legacyUrl, canonicalUrl } : null;
}
export type ShikimoriManga = { id: string; russian?: string | null; description?: string | null; externalLinks?: Array<{ url?: string | null }> };
export function mangaFromSnapshot(payload: unknown, externalId: string): ShikimoriManga | null {
  const response = payload as { data?: { mangas?: unknown } } | null;
  const mangas = response?.data?.mangas;
  if (!Array.isArray(mangas)) return null;
  return mangas.find((manga): manga is ShikimoriManga => isShikimoriManga(manga) && String(manga.id) === externalId) ?? null;
}
export function isShikimoriManga(value: unknown): value is ShikimoriManga {
  if (!value || typeof value !== "object") return false;
  const manga = value as ShikimoriManga;
  return /^[1-9]\d*$/.test(String(manga.id)) &&
    (manga.russian === null || typeof manga.russian === "string") &&
    (manga.description === null || typeof manga.description === "string") &&
    Array.isArray(manga.externalLinks) && manga.externalLinks.every(link => link && typeof link.url === "string");
}
export function matchesMangaUpdates(manga: ShikimoriManga, evidenceUrls: readonly string[]) {
  const identities = new Set(evidenceUrls.map(mangaUpdatesLinkIdentity).filter(Boolean));
  return manga.externalLinks?.some(link => link.url && identities.has(mangaUpdatesLinkIdentity(link.url))) ?? false;
}
export function decideMangaShikimoriFields(input: { aliases: string[]; description: string | null; title: string; originalTitle: string | null; maxTitleAliases: number; manga: ShikimoriManga | null }) {
  let aliases = [...input.aliases];
  const russian = input.manga?.russian?.trim();
  if (russian && hasCyrillicText(russian)) {
    const normalized = normalizeMediaItemTitleAliases(aliases, input);
    const withRussian = normalizeMediaItemTitleAliases([...aliases, russian], input);
    if (withRussian.length > normalized.length) {
      aliases = aliases.length < input.maxTitleAliases
        ? withRussian
        : normalizeMediaItemTitleAliases([...aliases.slice(0, -1), russian], input);
    }
  }
  const description = needsShikimoriDescriptionRefresh(input.description) && input.manga?.description
    ? sanitizeShikimoriDescription(input.manga.description) : null;
  return { aliases, description: description && hasCyrillicText(description) ? description : input.description };
}

export function shikimoriRetryAfterSeconds(value: string | null, now = Date.now()) {
  if (!value) return null;
  const seconds = /^\d+(?:\.\d+)?$/.test(value.trim()) ? Number(value) : (Date.parse(value) - now) / 1000;
  return Number.isFinite(seconds) && seconds > 0 ? Math.min(86400, Math.ceil(seconds)) : null;
}
