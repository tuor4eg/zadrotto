export const SITEMAP_BUCKET_SIZE = 10_000;
export const SITEMAP_CATEGORIES = ["media", "reviews", "collections", "series", "genres", "platforms", "creators"] as const;
export type SitemapCategory = typeof SITEMAP_CATEGORIES[number];
export type SitemapEntry = { url: string; updatedAt?: Date | string | null };
export const STATIC_SITEMAP_PATHS = ["/", "/archive", "/series", "/genres", "/platforms", "/creators", "/collections", "/reviews", "/achievements", "/about", "/help", "/rules"] as const;

export function isSitemapCategory(value: string): value is SitemapCategory {
  return SITEMAP_CATEGORIES.some((category) => category === value);
}

export function parseSitemapPage(value: string) {
  if (!/^(0|[1-9]\d*)\.xml$/.test(value)) return null;
  const page = Number(value.slice(0, -4));
  return Number.isSafeInteger(page) && page <= Math.floor((2_147_483_647 - 1) / SITEMAP_BUCKET_SIZE) ? page : null;
}

export function sitemapRange(page: number) {
  if (!Number.isSafeInteger(page) || page < 0 || page > 214_748) throw new Error("Invalid sitemap page");
  return { first: page * SITEMAP_BUCKET_SIZE + 1, last: Math.min((page + 1) * SITEMAP_BUCKET_SIZE, 2_147_483_647) };
}

export function sitemapEntryPath(category: SitemapCategory, key: string) {
  if (category === "media") return `/media/${encodeURIComponent(key)}`;
  if (category === "reviews") return `/reviews/${encodeURIComponent(key)}`;
  if (category === "collections") return `/collections/${encodeURIComponent(key)}`;
  const parameter = { series: "series", genres: "genre", platforms: "platform", creators: "creator" }[category];
  return `/archive?${parameter}=${encodeURIComponent(key)}`;
}

export function escapeSitemapXml(value: string) {
  return value.replace(/[<>&"']/g, (character) => ({ "<": "&lt;", ">": "&gt;", "&": "&amp;", '"': "&quot;", "'": "&apos;" })[character]!);
}

function xmlDate(value: SitemapEntry["updatedAt"]) {
  if (!value) return "";
  const date = new Date(value);
  return Number.isFinite(date.getTime()) ? `<lastmod>${date.toISOString()}</lastmod>` : "";
}

export function renderSitemap(origin: URL, entries: readonly SitemapEntry[]) {
  return `<?xml version="1.0" encoding="UTF-8"?><urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">${entries.map((entry) => `<url><loc>${escapeSitemapXml(new URL(entry.url, origin).href)}</loc>${xmlDate(entry.updatedAt)}</url>`).join("")}</urlset>`;
}

export function renderSitemapIndex(origin: URL, paths: readonly string[]) {
  return `<?xml version="1.0" encoding="UTF-8"?><sitemapindex xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">${paths.map((path) => `<sitemap><loc>${escapeSitemapXml(new URL(path, origin).href)}</loc></sitemap>`).join("")}</sitemapindex>`;
}

export function sitemapResponse(xml: string) {
  return new Response(xml, { headers: { "Content-Type": "application/xml; charset=utf-8", "Cache-Control": "public, s-maxage=3600, stale-while-revalidate=3600" } });
}
