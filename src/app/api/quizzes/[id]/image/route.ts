import { getCurrentAdminUser } from "@/lib/auth/admin-auth";
import { getCurrentAuthor } from "@/lib/auth/author-auth";
import { getQuizImageObjectKey } from "@/db/queries/quizzes";
import { fetchS3Object } from "@/lib/services/minio";

type Context = { params: Promise<{ id: string }> };
export async function GET(_request: Request, { params }: Context) {
  const id = Number((await params).id);
  if (!Number.isSafeInteger(id) || id <= 0 || id > 2_147_483_647) return new Response(null, { status: 404 });
  const [author, admin] = await Promise.all([getCurrentAuthor(), getCurrentAdminUser()]);
  const objectKey = await getQuizImageObjectKey(id, author?.id ?? null, Boolean(admin));
  if (!objectKey) return new Response(null, { status: 404 });
  const response = await fetchS3Object({ objectKey });
  if (!response?.body) return new Response(null, { status: 404 });
  return new Response(response.body, { headers: { "Cache-Control": "private, no-store", "Content-Type": "image/webp", "X-Content-Type-Options": "nosniff" } });
}
