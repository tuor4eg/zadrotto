import { isAssignedPlatformLogoObjectKey, isCachedPlatformProviderLogoObjectKey } from "@/db/queries/platform-logos";
import { isPlatformLogoObjectKey, isPlatformProviderLogoObjectKey } from "@/lib/platforms/logo-url";
import { getCurrentAdminUser } from "@/lib/auth/admin-auth";
import { fetchS3Object } from "@/lib/services/minio";

export async function GET(_request: Request, { params }: { params: Promise<{ objectKey: string[] }> }) {
  const { objectKey: segments } = await params;
  const key = segments[0] === "providers" ? ["avatars", "platform-providers", ...segments.slice(1)].join("/") : ["logos", "platforms", ...segments].join("/");
  if (!isPlatformLogoObjectKey(key) && !isPlatformProviderLogoObjectKey(key)) return new Response("Логотип не найден.", { status: 404 });
  const assigned = await isAssignedPlatformLogoObjectKey(key);
  if (!assigned && !(isPlatformProviderLogoObjectKey(key) && await getCurrentAdminUser() && await isCachedPlatformProviderLogoObjectKey(key))) return new Response("Логотип не найден.", { status: 404 });
  const object = await fetchS3Object({ objectKey: key });
  if (!object?.body) return new Response("Логотип не найден.", { status: 404 });
  return new Response(object.body, { headers: { "Cache-Control": assigned ? "public, max-age=31536000, immutable" : "private, no-store", "Content-Type": "image/webp", "X-Content-Type-Options": "nosniff" } });
}
