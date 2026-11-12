import { searchAdminMediaBrowser } from "@/db/queries/admin-media-browser";
import { getAccessibleMediaTypeCodes } from "@/db/queries/media-types";
import { parseAdminMediaBrowserQuery } from "@/lib/admin/media-browser";
import { getCurrentAuthor } from "@/lib/auth/author-auth";
import { getAuthRequestIpAddress } from "@/lib/auth/rate-limits";
import { hashOpaqueToken } from "@/lib/auth/opaque-token";
import { checkFixedWindowRateLimit } from "@/lib/rate-limits/redis";

export async function GET(request: Request) {
  const rate = await checkFixedWindowRateLimit({ keyPrefix: "tier-media-browser", subject: hashOpaqueToken(await getAuthRequestIpAddress()), window: "minute", limit: 60 });
  if (!rate.ok) return Response.json({ error: "Поиск временно недоступен." }, { status: 503 });
  if (!rate.allowed) return Response.json({ error: "Слишком много запросов." }, { status: 429, headers: { "Retry-After": String(rate.retryAfterSeconds) } });
  const author = await getCurrentAuthor();
  const types = await getAccessibleMediaTypeCodes(author?.id);
  const params = new URL(request.url).searchParams;
  if (!params.has("pageSize")) params.set("pageSize", "48");
  const query = parseAdminMediaBrowserQuery(params);
  const result = await searchAdminMediaBrowser(query, types);
  return Response.json({ ...result, items: result.items.map((item) => ({ ...item, metadataFacts: null })) }, { headers: { "Cache-Control": "private, no-store" } });
}
