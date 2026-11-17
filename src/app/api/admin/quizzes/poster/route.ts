import { getCurrentAdminUser } from "@/lib/auth/admin-auth";
import { readQuizPoster } from "@/lib/quizzes/poster";

export async function GET(request: Request) {
  if (!(await getCurrentAdminUser())) return new Response(null, { status: 401 });
  const id = Number(new URL(request.url).searchParams.get("id"));
  if (!Number.isSafeInteger(id) || id < 1 || id > 2_147_483_647) return new Response(null, { status: 400 });
  try {
    return new Response(new Uint8Array(await readQuizPoster(id)), { headers: { "Content-Type": "image/webp", "Cache-Control": "private, no-store", "X-Content-Type-Options": "nosniff" } });
  } catch { return new Response(null, { status: 404 }); }
}
