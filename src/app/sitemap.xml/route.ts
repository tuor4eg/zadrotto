import { unstable_cache } from "next/cache";

import { getSitemapBuckets } from "@/db/queries/seo-sitemap";
import { getSiteOrigin } from "@/lib/site-url";
import { renderSitemapIndex, sitemapResponse } from "@/lib/seo/sitemap";

export const dynamic = "force-dynamic";

const getCachedSitemapBuckets = unstable_cache(getSitemapBuckets, ["seo-sitemap-buckets"], { revalidate: 3600 });

export async function GET() {
  const origin = getSiteOrigin();
  const buckets = await getCachedSitemapBuckets();
  return sitemapResponse(renderSitemapIndex(origin, ["/sitemaps/static/0.xml", ...buckets.map(({ category, page }) => `/sitemaps/${category}/${page}.xml`)]));
}
