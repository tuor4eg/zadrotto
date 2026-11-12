import { searchPublicMediaBrowserSeries } from "@/db/queries/admin-media-browser";
import { getAccessibleMediaTypeCodes } from "@/db/queries/media-types";
import { getCurrentAuthor } from "@/lib/auth/author-auth";
import { getAuthRequestIpAddress } from "@/lib/auth/rate-limits";
import { hashOpaqueToken } from "@/lib/auth/opaque-token";
import { checkFixedWindowRateLimit } from "@/lib/rate-limits/redis";

export async function GET(request: Request) {
  const rate = await checkFixedWindowRateLimit({ keyPrefix: "tier-series-search", subject: hashOpaqueToken(await getAuthRequestIpAddress()), window: "minute", limit: 60 });
  if (!rate.ok) return Response.json({ error: "Поиск временно недоступен." }, { status: 503 });
  if (!rate.allowed) return Response.json({ error: "Слишком много запросов." }, { status: 429, headers: { "Retry-After": String(rate.retryAfterSeconds) } });
  const author = await getCurrentAuthor();
  const types = await getAccessibleMediaTypeCodes(author?.id);
  const q = (new URL(request.url).searchParams.get("q") ?? "").slice(0, 200);
  return Response.json(await searchPublicMediaBrowserSeries(q, types), { headers: { "Cache-Control": "private, no-store" } });
}
