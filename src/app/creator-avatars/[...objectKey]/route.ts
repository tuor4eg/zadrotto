import { isAssignedCreatorAvatarObjectKey } from "@/db/queries/creator-avatars";
import { isCreatorAvatarObjectKey } from "@/lib/creators/avatar-storage";
import { fetchS3Object } from "@/lib/services/minio";

export async function GET(_request: Request, { params }: { params: Promise<{ objectKey: string[] }> }) {
  const { objectKey: segments } = await params;
  const objectKey = ["avatars", "creators", ...segments].join("/");
  if (!isCreatorAvatarObjectKey(objectKey) || !await isAssignedCreatorAvatarObjectKey(objectKey)) return new Response("Аватар не найден.", { status: 404 });
  const object = await fetchS3Object({ objectKey });
  if (!object?.body) return new Response("Аватар не найден.", { status: 404 });
  return new Response(object.body, { headers: { "Cache-Control": "public, max-age=31536000, immutable", "Content-Type": "image/webp", "X-Content-Type-Options": "nosniff" } });
}
