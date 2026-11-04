import { getRevealedQuizAnswer } from "@/db/queries/quizzes";
import { getCurrentAuthor, getPersonalDataConsentDenial } from "@/lib/auth/author-auth";

export async function GET(_request: Request, { params }: { params: Promise<{ id: string }> }) {
  const consentDenial = await getPersonalDataConsentDenial();
  if (consentDenial) return consentDenial;
  const author = await getCurrentAuthor();
  if (!author) return Response.json({ answer: null }, { status: 401 });
  const { id } = await params;
  const quizId = Number(id);
  if (!/^\d+$/.test(id) || !Number.isSafeInteger(quizId) || quizId < 1 || quizId > 2_147_483_647) {
    return Response.json({ answer: null }, { status: 404 });
  }
  return Response.json({ answer: await getRevealedQuizAnswer(quizId, author.id) }, {
    headers: { "Cache-Control": "private, no-store" },
  });
}
