import { isAssignedAchievementImageObjectKey } from "@/db/queries/achievements";
import { isAchievementImageObjectKey } from "@/lib/achievements/images";
import { fetchS3Object } from "@/lib/services/minio";

type RouteContext = { params: Promise<{ objectKey: string[] }> };
const INTERNAL_IMAGE_PATH = "/_achievement-images";

export async function GET(_request: Request, { params }: RouteContext) {
  const { objectKey: segments } = await params;
  const objectKey = segments.join("/");
  if (!isAchievementImageObjectKey(objectKey) || !(await isAssignedAchievementImageObjectKey(objectKey))) {
    return new Response("Изображение не найдено.", { status: 404 });
  }

  if (process.env.NODE_ENV !== "development") {
    return new Response(null, {
      headers: {
        "Cache-Control": "public, max-age=31536000, immutable",
        "X-Accel-Redirect": `${INTERNAL_IMAGE_PATH}/${segments.map(encodeURIComponent).join("/")}`,
      },
    });
  }

  const response = await fetchS3Object({ objectKey });
  if (!response?.body) return new Response("Изображение не найдено.", { status: 404 });

  return new Response(response.body, {
    headers: {
      "Cache-Control": "public, max-age=31536000, immutable",
      "Content-Type": "image/webp",
      "X-Content-Type-Options": "nosniff",
    },
  });
}
