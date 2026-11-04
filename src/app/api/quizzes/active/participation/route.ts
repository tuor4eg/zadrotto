import { joinActiveQuiz } from "@/db/queries/quizzes";
import { getCurrentAuthor, getPersonalDataConsentDenial } from "@/lib/auth/author-auth";

export async function POST() {
  const consentDenial = await getPersonalDataConsentDenial();
  if (consentDenial) return consentDenial;
  const author = await getCurrentAuthor();
  if (!author) {
    return Response.json({ error: "Требуется авторизация." }, { status: 401 });
  }

  const result = await joinActiveQuiz(author.id);
  if (result.kind === "missing") {
    return Response.json({ error: "Активный квиз не найден." }, { status: 404 });
  }
  if (result.kind === "ineligible") {
    return Response.json({ error: "Сначала включи все разделы этого квиза в интересах." }, { status: 409 });
  }

  return Response.json({ participant: result.participant });
}
