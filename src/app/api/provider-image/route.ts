import { NextResponse } from "next/server";

import { getCoverProviderImageSetting, getCoverSettings } from "@/db/queries/cover-settings";
import { getCurrentAdminUser } from "@/lib/auth/admin-auth";
import { getCurrentAuthor } from "@/lib/auth/author-auth";
import { fetchProviderImage, verifyProviderImageToken } from "@/lib/covers/provider-image-relay";
import { checkProviderImageRelayRateLimit } from "@/lib/covers/rate-limits";

export async function GET(request: Request) {
  const [adminUser, author] = await Promise.all([getCurrentAdminUser(), getCurrentAuthor()]);
  if (!adminUser && !author) return new NextResponse(null, { status: 401 });

  const rateLimit = await checkProviderImageRelayRateLimit(
    adminUser ? `admin:${adminUser.id}` : `author:${author!.id}`,
  );
  if (!rateLimit.allowed) {
    return new NextResponse(null, {
      status: 429,
      headers: rateLimit.retryAfterSeconds
        ? { "retry-after": String(rateLimit.retryAfterSeconds) }
        : undefined,
    });
  }

  const token = new URL(request.url).searchParams.get("token");
  const payload = token ? verifyProviderImageToken(token) : null;
  if (!payload) return new NextResponse(null, { status: 400 });

  const [enabled, coverSettings] = await Promise.all([
    getCoverProviderImageSetting(payload.providerCode),
    getCoverSettings(),
  ]);
  if (!enabled) return new NextResponse(null, { status: 404 });

  const image = await fetchProviderImage({
    providerCode: payload.providerCode,
    imageUrl: payload.imageUrl,
    maxBytes: coverSettings.coverMaxBytes,
  });
  if (!image.ok) {
    const status = image.error === "too-large" ? 413 : image.error === "unsupported-type" ? 415 : 502;
    return new NextResponse(null, { status });
  }

  return new NextResponse(new Uint8Array(image.body), {
    headers: {
      "content-type": image.contentType,
      "cache-control": "private, max-age=300",
      "x-content-type-options": "nosniff",
    },
  });
}
