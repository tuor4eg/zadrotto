import { unstable_cache } from "next/cache";

import { isPersonalDataConsentRequired } from "@/db/queries/personal-data-consent";
import { getSitemapEntries } from "@/db/queries/seo-sitemap";
import { getSiteOrigin } from "@/lib/site-url";
import { isSitemapCategory, parseSitemapPage, renderSitemap, sitemapResponse, STATIC_SITEMAP_PATHS } from "@/lib/seo/sitemap";

export const dynamic = "force-dynamic";

const getCachedSitemapEntries = unstable_cache(getSitemapEntries, ["seo-sitemap-entries"], { revalidate: 3600 });
const getCachedConsentRequired = unstable_cache(async () => isPersonalDataConsentRequired(), ["seo-sitemap-consent"], { revalidate: 3600 });

export async function GET(_request: Request, { params }: { params: Promise<{ category: string; page: string }> }) {
  const { category, page: segment } = await params;
  const page = parseSitemapPage(segment);
  if (page === null || (category === "static" ? page !== 0 : !isSitemapCategory(category))) return new Response(null, { status: 404 });
  const origin = getSiteOrigin();
  if (category === "static") {
    const entries = STATIC_SITEMAP_PATHS.map((url) => ({ url: String(url) }));
    if (await getCachedConsentRequired()) entries.push({ url: "/privacy" });
    return sitemapResponse(renderSitemap(origin, entries));
  }
  if (!isSitemapCategory(category)) return new Response(null, { status: 404 });
  const entries = await getCachedSitemapEntries(category, page);
  if (!entries.length) return new Response(null, { status: 404 });
  return sitemapResponse(renderSitemap(origin, entries));
}
