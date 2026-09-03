import { getCollectionImagePublicationStatus } from "@/db/queries/editorial-collections";
import { getCurrentAdminUser } from "@/lib/auth/admin-auth";
import { isCollectionImageObjectKey } from "@/lib/collections/images";
import { fetchS3Object } from "@/lib/services/minio";

type Context = { params: Promise<{ objectKey: string[] }> };

export async function GET(_request: Request, { params }: Context) {
  const segments = (await params).objectKey;
  const objectKey = segments.join("/");
  if (!isCollectionImageObjectKey(objectKey)) {
    return new Response("Изображение не найдено.", { status: 404 });
  }
  const [status, admin] = await Promise.all([
    getCollectionImagePublicationStatus(objectKey),
    getCurrentAdminUser(),
  ]);
  if (!status || (status !== "published" && !admin)) {
    return new Response("Изображение не найдено.", { status: 404 });
  }
  if (process.env.NODE_ENV !== "development") {
    return new Response(null, {
      headers: {
        "Cache-Control": status === "published" ? "public, max-age=3600" : "private, max-age=3600",
        "X-Accel-Redirect": `/_collection-images/${segments.map(encodeURIComponent).join("/")}`,
      },
    });
  }
  const response = await fetchS3Object({ objectKey });
  if (!response?.body) return new Response("Изображение не найдено.", { status: 404 });
  return new Response(response.body, {
    headers: {
      "Cache-Control": status === "published" ? "public, max-age=3600" : "private, max-age=3600",
      "Content-Type": "image/webp",
      "X-Content-Type-Options": "nosniff",
    },
  });
}
