import { getQuizAnswerEntry, getQuizById } from "@/db/queries/quizzes";
import { getCurrentAuthor, getPersonalDataConsentDenial } from "@/lib/auth/author-auth";

export async function GET(request: Request, { params }: { params: Promise<{ id: string }> }) {
  const denial = await getPersonalDataConsentDenial();
  if (denial) return denial;
  const author = await getCurrentAuthor();
  if (!author) return Response.json({ entry: null }, { status: 401 });
  const id = Number((await params).id);
  const mediaItemId = Number(new URL(request.url).searchParams.get("mediaItemId"));
  if (![id, mediaItemId].every((value) => Number.isSafeInteger(value) && value > 0 && value <= 2_147_483_647)) return Response.json({ entry: null }, { status: 404 });
  const detail = await getQuizById(id, author.id);
  if (!detail || detail.finished || !detail.participant || detail.participant.completed) return Response.json({ entry: null }, { status: 403 });
  const entry = await getQuizAnswerEntry(mediaItemId, detail.quiz.mediaTypes, author.id);
  if (!entry) return Response.json({ entry: null }, { status: 404 });
  return Response.json({ entry, ratingAuthor: { name: author.name, code: author.code } }, { headers: { "Cache-Control": "private, no-store" } });
}
