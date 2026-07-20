import { canViewMediaItemCover } from "@/db/queries/media-items";
import { getCurrentAuthor } from "@/lib/auth/author-auth";
import { fetchS3Object } from "@/lib/services/minio";

type CoverRouteContext = {
  params: Promise<{
    objectKey: string[];
  }>;
};

function getSafeCoverObjectKey(segments: string[]) {
  if (segments.length === 0) {
    return null;
  }

  if (segments.some((segment) => !segment || segment === "." || segment === "..")) {
    return null;
  }

  return segments.join("/");
}

export async function GET(_request: Request, { params }: CoverRouteContext) {
  const { objectKey: segments } = await params;
  const objectKey = getSafeCoverObjectKey(segments);

  if (!objectKey) {
    return new Response("Обложка не найдена.", { status: 404 });
  }

  const currentAuthor = (await getCurrentAuthor()) ?? undefined;
  const canViewCover = await canViewMediaItemCover(objectKey, currentAuthor);

  if (!canViewCover) {
    return new Response("Обложка не найдена.", { status: 404 });
  }

  const s3Response = await fetchS3Object({ objectKey });

  if (!s3Response?.body) {
    return new Response("Обложка не найдена.", { status: 404 });
  }

  return new Response(s3Response.body, {
    headers: {
      "Cache-Control": "private, max-age=300",
      "Content-Type": s3Response.headers.get("content-type") ?? "application/octet-stream",
    },
  });
}
