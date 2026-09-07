import { getCurrentAdminUser } from "@/lib/auth/admin-auth";
import { getCurrentAuthor } from "@/lib/auth/author-auth";
import { isActiveQuizImageObjectKey, isAssignedQuizImageObjectKey } from "@/db/queries/quizzes";
import { isQuizImageObjectKey } from "@/lib/quizzes/images";
import { fetchS3Object } from "@/lib/services/minio";
type Context = { params: Promise<{ objectKey: string[] }> };
export async function GET(_request: Request, { params }: Context) {
  const segments = (await params).objectKey; const objectKey = segments.join("/");
  if (!isQuizImageObjectKey(objectKey)) return new Response("Изображение не найдено.", { status: 404 });
  const authorized = Boolean((await getCurrentAuthor()) || (await getCurrentAdminUser()));
  const accessible = authorized
    ? await isAssignedQuizImageObjectKey(objectKey)
    : await isActiveQuizImageObjectKey(objectKey);
  if (!accessible) return new Response("Изображение не найдено.", { status: 404 });
  if (process.env.NODE_ENV !== "development") return new Response(null, { headers: { "Cache-Control": "private, max-age=3600", "X-Accel-Redirect": `/_quiz-images/${segments.map(encodeURIComponent).join("/")}` } });
  const response = await fetchS3Object({ objectKey }); if (!response?.body) return new Response("Изображение не найдено.", { status: 404 });
  return new Response(response.body, { headers: { "Cache-Control": "private, max-age=3600", "Content-Type": "image/webp", "X-Content-Type-Options": "nosniff" } });
}
