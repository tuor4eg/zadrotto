import { getQuizById, searchQuizAnswerTitles } from "@/db/queries/quizzes";
import { getCurrentAuthor, getPersonalDataConsentDenial } from "@/lib/auth/author-auth";

export async function GET(request: Request, { params }: { params: Promise<{ id: string }> }) {
  const denial = await getPersonalDataConsentDenial();
  if (denial) return denial;
  const author = await getCurrentAuthor();
  if (!author) return Response.json({ items: [] }, { status: 401 });
  const id = Number((await params).id);
  if (!Number.isSafeInteger(id) || id < 1 || id > 2_147_483_647) return Response.json({ items: [] }, { status: 404 });
  const detail = await getQuizById(id, author.id);
  if (!detail || detail.finished || !detail.participant || detail.participant.completed) return Response.json({ items: [] }, { status: 403 });
  const query = new URL(request.url).searchParams.get("q")?.trim() ?? "";
  if (query.length < 2 || query.length > 200) return Response.json({ items: [] });
  return Response.json({ items: await searchQuizAnswerTitles(query, detail.quiz.mediaTypes) }, { headers: { "Cache-Control": "private, no-store" } });
}
