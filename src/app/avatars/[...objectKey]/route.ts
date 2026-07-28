import { isAssignedAuthorAvatarObjectKey } from "@/db/queries/authors";
import { isAuthorAvatarObjectKey } from "@/lib/avatars/storage";
import { fetchS3Object } from "@/lib/services/minio";

type AvatarRouteContext = {
  params: Promise<{ objectKey: string[] }>;
};

export async function GET(_request: Request, { params }: AvatarRouteContext) {
  const { objectKey: segments } = await params;
  const objectKey = ["avatars", ...segments].join("/");

  if (!isAuthorAvatarObjectKey(objectKey) || !(await isAssignedAuthorAvatarObjectKey(objectKey))) {
    return new Response("Аватар не найден.", { status: 404 });
  }

  const s3Response = await fetchS3Object({ objectKey });
  if (!s3Response?.body) {
    return new Response("Аватар не найден.", { status: 404 });
  }

  return new Response(s3Response.body, {
    headers: {
      "Cache-Control": "no-store",
      "Content-Type": "image/webp",
      "X-Content-Type-Options": "nosniff",
    },
  });
}
