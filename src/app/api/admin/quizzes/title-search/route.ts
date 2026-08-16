import { getCurrentAdminUser } from "@/lib/auth/admin-auth";
import { searchQuizAnswerTitles } from "@/db/queries/quizzes";
export async function GET(request: Request) {
  if (!(await getCurrentAdminUser())) return Response.json({ error: "Требуется авторизация." }, { status: 401 });
  const q = new URL(request.url).searchParams.get("q") ?? "";
  return Response.json({ items: await searchQuizAnswerTitles(q) });
}
