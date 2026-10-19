import { and, eq } from "drizzle-orm";
import { db } from "@/db";
import { gameCompanyProfiles } from "@/db/schema";
import { requireAdminUser } from "@/lib/auth/admin-auth";
import { isExternalCompanyImageKey } from "@/lib/creators/game-company-images";
import { fetchS3Object } from "@/lib/services/minio";

export async function GET(_request: Request, { params }: { params: Promise<{ objectKey: string[] }> }) {
  await requireAdminUser();
  const { objectKey: segments } = await params;
  const objectKey = ["avatars", "external-companies", ...segments].join("/");
  if (!isExternalCompanyImageKey(objectKey)) return new Response("Изображение не найдено.", { status: 404 });
  const [profile] = await db.select({ id: gameCompanyProfiles.externalId }).from(gameCompanyProfiles).where(and(eq(gameCompanyProfiles.imageObjectKey, objectKey), eq(gameCompanyProfiles.imageStatus, "ready"))).limit(1);
  if (!profile) return new Response("Изображение не найдено.", { status: 404 });
  const object = await fetchS3Object({ objectKey });
  if (!object?.body) return new Response("Изображение не найдено.", { status: 404 });
  return new Response(object.body, { headers: { "Cache-Control": "private, max-age=3600", "Content-Type": "image/webp", "X-Content-Type-Options": "nosniff" } });
}
